# BỘ NHỚ HỆ THỐNG - DỰ ÁN SẢN LƯỢNG GCCK 2026

*Mốc chốt dữ liệu & cấu hình hệ thống: 10/09/2026 - Phiên làm việc tối*

---

## 1. NGUYÊN TẮC LÀM VIỆC BẤT BIẾN (CORE RULES)
1. **Luôn trao đổi và thống nhất với Quản đốc trước khi sửa code**: Không tự ý sửa đổi file mã nguồn hay chạy lệnh can thiệp khi chưa được duyệt.
2. **Bảo vệ tuyệt đối Mini App & Sheet `Nhật Ký Sản Lượng`**:
   - Sheet `Nhật Ký Sản Lượng` đang ghi nhận dữ liệu thực tế công nhân nộp qua điện thoại -> Tuyệt đối không xóa, không đổi tên cột, không làm gián đoạn.
   - Sheet `Danh Mục Master` lưu trữ cấu hình Master Data của Mini App -> Bảo toàn nguyên vẹn.

---

## 2. CẤU TRÚC HỆ THỐNG 11 SHEET CHUẨN HÓA (TỪ FILE BAO_CAO_GCCK_CHUAN_HOA_QR_KHOAN_2026)
Hệ thống Google Sheet đã được chuẩn hóa và loại bỏ toàn bộ 17 sheet máy lẻ cũ (`M01_...` đến `M17_...`), hoạt động trên khung sườn 11 sheet nghiệp vụ:

1. **`Nhật Ký Sản Lượng`**: Ghi nhận toàn bộ báo cáo sản lượng theo thời gian thực từ Mini App công nhân.
2. **`Danh Mục Master`**: Cơ sở dữ liệu Master Data (Mã hàng, công nhân, máy móc, đơn giá khoán).
3. **`01_Tong_Quan_Dashboard`**: Bảng điều hành tổng thể KPIs, tỷ lệ phế phẩm và tiến độ theo từng đối tác khách hàng.
4. **`02_Canh_Bao_Qua_Tai_SubCon`**: Cảnh báo đơn hàng quá tải và đề xuất thuê ngoài vệ tinh (Sub-con).
5. **`03_Can_Bang_Tai_17_May`**: Giám sát công suất & số giờ chạy của toàn bộ 17 máy thiết bị trong 1 bảng duy nhất.
6. **`04_Bao_Gia_Gia_Thanh_SP`**: Bảng tính giá thành gia công, tiền phôi đúc và báo giá chi tiết.
7. **`05_Dinh_Muc_Khoan_Routing`**: Định mức công nghệ, mức khoán theo từng nguyên công & tiêu hao dao cụ.
8. **`06_Ke_Hoach_Tien_Do_PO`**: Quản lý tiến độ đơn hàng PO/LSX, tự động tính BTP hoàn thành, tồn WIP, nợ kế hoạch.
9. **`08_Kiem_Soat_Chat_Luong_QA`**: Kiểm soát chất lượng QA/QC, phân loại phế phẩm (Lỗi đúc vs Lỗi thợ gia công).
10. **`09_Truy_Xuat_BTP_Luan_Chuyen`**: Sổ truy xuất nguồn gốc và bàn giao bán thành phẩm giữa các công đoạn.
11. **`10_Bang_Luong_Khoan_Tho`**: Bảng tổng hợp lương khoán thợ (Số ca làm, giờ máy, SL Đạt OK, SL Hỏng NG, tiền khoán).
12. **`11_Master_Data`**: Danh bạ khách hàng, đơn giá giờ máy nội bộ và danh bạ đơn vị vệ tinh gia công ngoài.

---

## 3. CƠ CHẾ TÍNH TOÁN 100% SẠCH LỖI `#ERROR!`
- **Không dùng công thức Excel chứa dấu phẩy `,`**: Tránh hoàn toàn lỗi phân tích cú pháp (`Formula parse error`) do xung đột định dạng vùng Việt Nam.
- **Tính toán trực tiếp bằng JavaScript (Google V8 Engine)** qua hàm `calculateAndPopulateAllSheets()`:
  - Tự động quét và tổng hợp từ sheet `Nhật Ký Sản Lượng`.
  - Ghi thẳng giá trị thực tế (số lượng, tiền VNĐ, tỷ lệ %) vào các sheet báo cáo.
- **Tự động đồng bộ**: Mỗi khi công nhân bấm nộp báo cáo từ Mini App, hàm `doPost()` sẽ tự động kích hoạt tính toán và cập nhật số liệu ngay lập tức.

---

## 4. TIÊU CHUẨN THẨM MỸ & ĐỊNH DẠNG (FORMATTING)
- **Kẻ ô kẻ viền (Full Borders)**: Toàn bộ vùng dữ liệu được kẻ viền sắc nét màu Slate (`#cbd5e1`).
- **Thanh tiêu đề Header**: Đồng bộ 100% màu **Xanh Ngọc Lục Bảo tươi sáng (Emerald Green `#059669`)**, chữ trắng đậm (`#ffffff`), font `Roboto`, căn giữa, viền bo `#047857`.
- **Màu nền so le (Zebra striping)**: Dòng chẵn `#ffffff`, dòng lẻ `#f8fafc`.
- **Căn lề**: STT/Mã/Ngày căn giữa, Tên/Khách hàng căn trái, Số lượng/Tiền/% căn phải.
- **Độ rộng cột**: Tự động đo và co giãn vừa vặn (tối thiểu 75px, tối đa 380px), không bị co cụm chữ.

---

## 5. HỆ THỐNG CẢNH BÁO TELEGRAM CHO 3 CA
- **Bot**: `@gcck_sanluong_2026_bot` (Token: `8871498341:AAFTzNNaCNXZlaTJlh8znudxrYFs69bu74s`)
- **Quản Đốc / Nhóm xưởng**: Chat ID `5422717407` (Quản Đốc Hoàng Hà) và Nhóm xưởng
- **Bộ hẹn giờ (Triggers)**:
  - Ca 1 (Sáng): Tự động quét và nhắc nhở lúc **14h15**
  - Ca 2 (Chiều): Tự động quét và nhắc nhở lúc **22h15**
  - Ca 3 (Đêm): Tự động quét và nhắc nhở lúc **06h15 sáng hôm sau**
- Hàm kích hoạt bộ hẹn giờ: `setupShiftTriggers()`
- Hàm kiểm tra tức thì: `banThuCanhBaoTelegramNgay()`, `checkShift1_14h()`, `checkShift2_22h()`, `checkShift3_06h()`
- Hàm tìm ID nhóm xưởng tự động: `layIdNhomTelegramTuDong()`

---

## 6. MENU ĐIỀU HÀNH TRÊN GOOGLE SHEET (`⚙️ Quản Lý GCCK 2026`)
- `🚀 KHỞI TẠO BỘ 11 SHEET CHUẨN HÓA (100% SẠCH LỖI #ERROR!)`: Chạy hàm `setup11ChuanHoaSheets`
- `🎨 KẺ Ô VIỀN & ĐỊNH DẠNG CHUYÊN NGHIỆP`: Chạy hàm `formatAllSheetsProfessionally`
- `🔄 CẬP NHẬT TIẾN ĐỘ & LƯƠNG KHOÁN THỰC TẾ`: Chạy hàm `calculateAndPopulateAllSheets`
- `🧹 XÓA 17 SHEET MÁY LẺ CŨ (CHO GỌN BẢNG TÍNH)`: Chạy hàm `deleteOld17MachineSheets`
- `⏰ Cài Đặt Bộ Hẹn Giờ Cảnh Báo 3 Ca`: Chạy hàm `setupShiftTriggers`
