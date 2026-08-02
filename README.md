# Aegis Vault

Aegis Vault `0.3.80` là tiện ích quản lý mật khẩu và OTP theo mô hình local-first dành cho Google Chrome và Microsoft Edge. Vault được mã hóa bằng AES-256-GCM; khóa mã hóa được dẫn xuất từ mật khẩu chính bằng PBKDF2-SHA-256 với 600.000 vòng.

## Tính năng chính

- Quản lý tài khoản đăng nhập, ghi chú bảo mật, thẻ thanh toán và mã OTP.
- Liên kết OTP với từng tài khoản bằng mã bí mật Base32 hoặc URI `otpauth://`.
- Tách riêng Tên/User ID đăng nhập với Dịch vụ/Tài khoản OTP.
- Hiển thị mã OTP, vòng đếm ngược và sao chép trực tiếp trong popup tài khoản.
- Quét QR từ màn hình hoặc ảnh để tạo OTP độc lập.
- Tự nhận diện chính xác `scheme + hostname + port`; không gợi ý chéo subdomain.
- Điền thông tin sau thao tác trực tiếp của người dùng và không tự gửi biểu mẫu.
- Đồng bộ bản mã hóa qua vùng AppData riêng của Google Drive.
- Phát hiện xung đột dữ liệu và không âm thầm ghi đè bản local hoặc Drive.
- Import/export CSV, OTP và backup toàn bộ vault ở dạng mã hóa.
- Thùng rác, xác nhận khôi phục/xóa và báo cáo độ an toàn mật khẩu.

## Cài đặt nhanh

### Yêu cầu

- Google Chrome 106 trở lên hoặc Microsoft Edge dùng Chromium tương đương.
- Node.js chỉ cần thiết khi chạy kiểm thử hoặc đóng gói.
- Một dự án Firebase và Google OAuth nếu tự triển khai từ mã nguồn.

### Tải tiện ích đã giải nén

1. Tải hoặc clone repository:

   ```powershell
   git clone https://github.com/okebaybii/extensionpassword.git
   ```

2. Mở thư mục dự án.
3. Cấu hình Firebase theo phần bên dưới.
4. Mở `chrome://extensions/` hoặc `edge://extensions/`.
5. Bật **Chế độ dành cho nhà phát triển**.
6. Chọn **Tải tiện ích đã giải nén**.
7. Chọn thư mục chứa `manifest.json`.
8. Sau mỗi lần cập nhật, bấm **Tải lại** trên thẻ Aegis Vault.

Xem hướng dẫn triển khai chi tiết tại [INSTALL.md](INSTALL.md).

## Cấu hình Firebase an toàn

Repository không chứa Firebase key thực tế. File `src/auth/firebase-config.js` được Git bỏ qua.

1. Sao chép file mẫu:

   ```powershell
   Copy-Item src/auth/firebase-config.example.js src/auth/firebase-config.js
   ```

2. Mở `src/auth/firebase-config.js`.
3. Thay các giá trị `YOUR_*` bằng cấu hình Web App từ Firebase Console.
4. Không dùng `git add -f` với file này và không gửi file thật lên GitHub.

> Firebase Web API key không phải private key, nhưng vẫn nên giới hạn API/referrer trong Google Cloud và không đưa cấu hình môi trường thật vào repository công khai.

## Hướng dẫn sử dụng

### 1. Đăng nhập và tạo Vault

1. Mở popup Aegis Vault.
2. Đăng nhập đúng tài khoản Google cần sở hữu Vault.
3. Tạo mật khẩu chính mạnh, dài tối thiểu 12 ký tự.
4. Ghi nhớ mật khẩu chính; Aegis không lưu và không thể khôi phục mật khẩu này.

Mỗi tài khoản Google có vùng Drive AppData riêng. Đăng nhập tài khoản nào thì chỉ truy cập Vault mã hóa thuộc tài khoản đó.

### 2. Thêm tài khoản đăng nhập

Trong trang **Quản lý**, chọn thêm tài khoản rồi nhập:

- Name: tên gợi nhớ của thông tin đăng nhập.
- Go to URL: địa chỉ trang đăng nhập.
- Match URL: tên miền dùng để nhận diện và gợi ý.
- User ID: tên đăng nhập hoặc email.
- Password: mật khẩu của tài khoản.

Nếu không dùng OTP, để trống toàn bộ phần **Thông tin OTP**.

### 3. Liên kết OTP với tài khoản

Trong phần **Thông tin OTP**, nhập đủ:

- Dịch vụ OTP.
- Tài khoản OTP.
- Mã bí mật OTP dạng Base32.

Hoặc dán URI `otpauth://`; Aegis sẽ tự đọc dịch vụ, tài khoản, thuật toán, số chữ số và chu kỳ.

Khi lưu:

- Một bản ghi OTP riêng được tạo trong mục **OTP**.
- Tài khoản liên kết với OTP bằng `otpId`.
- Popup tài khoản hiển thị mã OTP, vòng đếm ngược và hỗ trợ click thẻ để sao chép.
- Sửa Dịch vụ/Tài khoản OTP không thay đổi Name/User ID đăng nhập.

### 4. Tạo OTP độc lập

Trong mục **OTP**, có thể:

- Nhập thủ công.
- Dán URI `otpauth://`.
- Quét QR trên màn hình.
- Chọn ảnh QR.

OTP tạo trực tiếp trong mục OTP là bản ghi độc lập, không tự tạo hoặc sửa tài khoản đăng nhập.

### 5. Xem và sao chép

- Click thẻ tài khoản để mở popup chi tiết.
- Dùng biểu tượng mắt để hiện hoặc ẩn mật khẩu.
- Dùng nút sao chép cho tên đăng nhập và mật khẩu.
- Click toàn bộ thẻ OTP để sao chép mã OTP.
- Thông báo sẽ ghi rõ nội dung vừa sao chép.

### 6. Backup và khôi phục

Trong **Quản lý → Cài đặt**:

- Xuất backup mã hóa để sao lưu an toàn.
- Khôi phục bằng đúng mật khẩu của file backup.
- Export CSV chỉ nên dùng để chuyển sang trình quản lý khác vì CSV chứa mật khẩu dạng rõ.

Ưu tiên backup mã hóa và giữ ít nhất một bản độc lập với Google Drive.

## Đồng bộ Google Drive

- Dữ liệu gửi lên Drive luôn là envelope đã mã hóa và xác thực.
- Cùng một Gmail trên nhiều trình duyệt sẽ sử dụng cùng Vault nếu OAuth và Extension ID được cấu hình đúng.
- Khi phát hiện hai nhánh dữ liệu, Aegis yêu cầu người dùng chọn thay vì tự ghi đè.
- Access token chỉ được giữ trong `chrome.storage.session`.

## Nguyên tắc bảo mật

- Mật khẩu chính không được ghi xuống ổ đĩa hoặc Google Drive.
- Mật khẩu và OTP secret không được gửi lên Drive dưới dạng rõ.
- Content script chỉ chạy trên HTTPS; HTTP chỉ dành cho `localhost` và `127.0.0.1` khi phát triển.
- Background kiểm tra origin trước khi trả credential cho autofill.
- File `firebase-config.js`, `.env`, private key và chứng thư được loại khỏi Git.
- Không commit file `.pem`, `.key`, `.p12` hoặc backup chứa dữ liệu thật.

## Kiểm thử và đóng gói

```powershell
npm run check
npm test
.\scripts\package-extension.ps1
```

Gói portable được tạo tại `dist/aegis-vault.zip`.

## Tài liệu

- [INSTALL.md](INSTALL.md): cài đặt trên máy khác, OAuth và Extension ID.
- [PRIVACY_POLICY.md](PRIVACY_POLICY.md): chính sách quyền riêng tư.

> Aegis Vault là phần mềm tự quản lý dữ liệu. Hãy kiểm thử kỹ và giữ backup trước khi sử dụng làm nơi lưu duy nhất cho thông tin quan trọng.
