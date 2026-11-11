[README.md](https://github.com/user-attachments/files/34677689/README.md)
# mes-defect

MES Defect Reporting — static frontend (`index.html`) + Google Apps Script backend (`apps-script.js`).

## Cấu hình ImgBB (bắt buộc)

API key ImgBB **không còn nằm trong `index.html`**. Ảnh được gửi qua Apps Script, key
được lưu ở Script Properties (phía server).

1. Tạo API key ImgBB mới (key cũ từng nằm trong HTML nên coi như đã bị lộ).
2. Mở Google Sheet → Extensions → Apps Script, dán `apps-script.js`.
3. Vào Project Settings → Script Properties (hoặc sửa rồi chạy `setupImgbb()` một lần):
   - `IMGBB_KEY` = API key mới
4. Deploy → Manage deployments → Edit → New version.
5. Dán Web App URL (`.../exec`) vào biến `GOOGLE_SHEET_API` trong `index.html`.

ImgBB API công khai không hỗ trợ đăng thẳng vào album. Ảnh vẫn được upload bình thường;
việc sắp xếp/gợi ý theo style code do Google Sheet đảm nhiệm.

Khi chọn/chụp ảnh, ảnh **không upload ngay** — chỉ hiện preview và nút `📤 Lưu ảnh gợi ý`.
Ảnh được upload + lưu gợi ý vào Sheet khi:
- bấm `📤 Lưu ảnh gợi ý`, hoặc
- gửi báo cáo (nếu chưa bấm nút).

Nhờ vậy nếu chọn nhầm Package ID, ảnh chưa bị đẩy lên ImgBB với sai style code.
Tên file trên ImgBB có dạng `STYLECODE_yyyyMMdd_HHmmss.jpg`.
Sheet dùng `Image URL` làm khóa upsert: sửa ghi chú/gửi lại báo cáo sẽ cập nhật đúng dòng,
không tạo bản ghi trùng.

## Ghi chú hành vi (frontend)

- **Camera:** chỉ camera trước (selfie) bị lật gương; camera sau hiển thị đúng chiều thực tế.
- **Dùng ảnh đã lưu (tab Link ảnh):** tái sử dụng đúng link ImgBB cũ, không upload lại —
  hiện dòng nhắc xanh dưới ảnh xem trước.
- **Modal xác nhận:** chỉ 1 panel tại một thời điểm; `Enter` = xác nhận, `Esc` = hủy.
- **Chống upload trùng:** nếu upload đang chạy (bấm nút rồi gửi ngay), mọi lời gọi
  cùng chờ 1 kết quả chung — 1 ảnh chỉ được đẩy lên ImgBB đúng 1 lần.

Các thay đổi trên đều nằm trong `index.html` — không cần deploy lại Apps Script.
