# Aegis Vault

Extension quản lý thông tin đăng nhập local-first dành cho Chrome/Edge. Vault dùng PBKDF2-SHA-256 (600.000 vòng) để dẫn xuất khóa và AES-256-GCM để mã hóa có xác thực.

## Cài đặt thử nghiệm

1. Mở `chrome://extensions` hoặc `edge://extensions`.
2. Bật **Developer mode**.
3. Chọn **Load unpacked** và trỏ tới thư mục dự án.
4. Mở popup để tạo vault bằng mật khẩu chính từ 10 ký tự.

## Nguyên tắc bảo mật

- Mật khẩu chính không được lưu lâu dài; chỉ giữ trong `storage.session` khi vault mở.
- Credential chỉ được giải mã trong trusted extension context.
- Content script chỉ nhận đúng một credential sau khi kiểm tra origin.
- V1 không đồng bộ cloud và không tự submit form.

> Đây là bản thử nghiệm. Không dùng để lưu dữ liệu thật trước khi có security review độc lập.
