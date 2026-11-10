/**
 * MES Defect Report — Google Apps Script
 * Database lưu link ảnh lỗi theo style code
 *
 * HƯỚNG DẪN DEPLOY:
 * 1. Mở Google Sheet:
 *   
 * 2. Menu: Extensions → Apps Script
 * 3. Xóa code cũ, paste toàn bộ file này vào
 * 4. Click Deploy → New deployment
 * 5. Chọn type: Web app
 *    - Description: MES Defect Image DB
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6. Click Deploy → Authorize khi được hỏi
 * 7. Copy Web App URL (kết thúc bằng /exec)
 * 8. Mở index.html, tìm biến GOOGLE_SHEET_API, dán URL vào
 *
 * CẤU HÌNH IMGBB (BẮT BUỘC — để key không bị lộ ở client):
 * 9. Trong Apps Script editor, mở Project Settings → Script Properties
 *    (hoặc sửa hàm setupImgbb() bên dưới rồi bấm Run 1 lần)
 *    - IMGBB_KEY = API key ImgBB MỚI (key cũ đã bị lộ, nên tạo key khác)
 * 10. Deploy lại Web App (Manage deployments → Edit → New version) sau khi sửa code.
 *
 * LƯU Ý: API công khai của ImgBB không hỗ trợ đăng thẳng vào album.
 * Ảnh vẫn được upload bình thường; việc sắp xếp theo style code do Sheet đảm nhiệm.
 *
 * SHEET COLUMNS (tự tạo khi lần đầu chạy):
 * Timestamp | Package ID | Style Code | Line | Style Name | Target | Status | Image URL | Note | User
 */

const SHEET_NAME = 'Images';
const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';

// === GET: Query ảnh theo style code ===
function doGet(e) {
  const action = (e.parameter.action || '').toLowerCase();
  if (action === 'query') return queryByStyleCode(e.parameter.code || '');
  return jsonOut({ success: false, error: 'Unknown action: ' + action });
}

// === POST: Lưu link ảnh + thông tin gói ===
function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut({ success: false, error: 'Invalid JSON' });
  }
  if (data.action === 'save') return saveImage(data);
  if (data.action === 'upload') return uploadToImgbb(data);
  return jsonOut({ success: false, error: 'Unknown action' });
}

// === Upload ảnh lên ImgBB (key nằm ở server, không lộ ra client) ===
function uploadToImgbb(data) {
  const props = PropertiesService.getScriptProperties();
  const key = (props.getProperty('IMGBB_KEY') || '').trim();

  if (!key || key === 'DAN_API_KEY_MOI_VAO_DAY') {
    return jsonOut({ success: false, error: 'Chưa cấu hình IMGBB_KEY trong Apps Script Properties' });
  }
  if (!data || !data.image) return jsonOut({ success: false, error: 'Thiếu dữ liệu ảnh' });

  try {
    const raw = String(data.image).replace(/^data:[^;]+;base64,/, '');
    const mime = data.mimeType || 'image/jpeg';
    const ext = (mime.split('/')[1] || 'jpg').split('+')[0];
    const name = data.name || ('mes_' + Date.now() + '.' + ext);
    const blob = Utilities.newBlob(Utilities.base64Decode(raw), mime, name);

    const res = UrlFetchApp.fetch(IMGBB_UPLOAD_URL + '?key=' + encodeURIComponent(key), {
      method: 'post',
      payload: { image: blob },
      muteHttpExceptions: true
    });

    let json;
    try { json = JSON.parse(res.getContentText()); }
    catch (e) { return jsonOut({ success: false, error: 'ImgBB trả về dữ liệu không hợp lệ' }); }

    if (json.success && json.data) {
      return jsonOut({
        success: true,
        url: json.data.url,
        display_url: json.data.display_url,
        delete_url: json.data.delete_url
      });
    }
    return jsonOut({
      success: false,
      error: (json.error && json.error.message) || ('ImgBB HTTP ' + res.getResponseCode())
    });
  } catch (err) {
    return jsonOut({ success: false, error: err.message || String(err) });
  }
}

// === Chạy 1 lần trong editor để lưu cấu hình ImgBB vào Script Properties ===
// LƯU Ý: thay key bên dưới bằng key MỚI, sau đó có thể xóa key khỏi code.
function setupImgbb() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('IMGBB_KEY', 'DAN_API_KEY_MOI_VAO_DAY');
  Logger.log('Đã lưu cấu hình ImgBB. Nhớ Deploy lại Web App với version mới.');
}

// === Query ảnh theo style code ===
function queryByStyleCode(styleCode) {
  const sheet = getOrCreateSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) return jsonOut({ success: true, images: [], count: 0 });

  // Columns: [Timestamp, Package ID, Style Code, Line, Style Name, Target, Status, Image URL, Note, User]
  const results = [];
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][2]).trim() === styleCode) {
      results.push({
        imageUrl: values[i][7] || '',
        note: values[i][8] || '',
        user: values[i][9] || '',
        timestamp: values[i][0] ? new Date(values[i][0]).toISOString() : ''
      });
    }
  }
  return jsonOut({ success: true, images: results, count: results.length });
}

// === Lưu / cập nhật link ảnh (upsert theo Image URL) ===
// - Lần đầu: append 1 dòng mới.
// - Các lần sau (submit lại, sửa ghi chú, đổi gói): cập nhật đúng dòng cũ,
//   tránh trùng lặp ảnh trong Sheet.
function saveImage(data) {
  const sheet = getOrCreateSheet();
  const imageUrl = String(data.imageUrl || '').trim();
  const rowValues = [
    data.packageId || '',
    data.styleCode || '',
    data.line || '',
    data.styleName || '',
    data.target || '',
    data.status || '',
    imageUrl,
    data.note || '',
    data.user || ''
  ];

  if (imageUrl) {
    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][7]).trim() === imageUrl) {
        // Cập nhật từ cột B → J, giữ nguyên Timestamp gốc ở cột A
        sheet.getRange(i + 1, 2, 1, 9).setValues([rowValues]);
        return jsonOut({ success: true, message: 'Updated', updated: true });
      }
    }
  }

  sheet.appendRow([new Date(), ...rowValues]);
  return jsonOut({ success: true, message: 'Saved', updated: false });
}

// === Tạo sheet + header nếu chưa có ===
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow([
      'Timestamp', 'Package ID', 'Style Code', 'Line', 'Style Name',
      'Target', 'Status', 'Image URL', 'Note', 'User'
    ]);
    // Định dạng header
    sheet.getRange(1, 1, 1, 10)
      .setFontWeight('bold')
      .setBackground('#fee2e2')
      .setFontColor('#991b1b');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 150);
    sheet.setColumnWidth(2, 280);
    sheet.setColumnWidth(3, 180);
    sheet.setColumnWidth(8, 320);
  }
  return sheet;
}

// === Helper: JSON output ===
function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
