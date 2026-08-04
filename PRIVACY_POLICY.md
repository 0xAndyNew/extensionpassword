# Aegis Vault Privacy Policy / Chính sách quyền riêng tư

**Effective date / Ngày hiệu lực:** August 4, 2026 / 04-08-2026

This policy explains how Aegis Vault handles information when you use the browser extension.

Chính sách này giải thích cách Aegis Vault xử lý thông tin khi bạn sử dụng tiện ích trình duyệt.

## 1. Vault encryption / Mã hóa vault

- Passwords, OTP secrets, secure notes and payment-card data are encrypted on the device with AES-256-GCM.
- The encryption key is derived from the master password using PBKDF2-SHA-256 with 600,000 iterations.
- The master password is not uploaded to Firebase and cannot be recovered by the extension author.
- Cloud Firestore receives only the encrypted vault envelope and synchronization metadata.

- Mật khẩu, OTP secret, ghi chú bảo mật và dữ liệu thẻ được mã hóa trên thiết bị bằng AES-256-GCM.
- Khóa mã hóa được dẫn xuất từ mật khẩu chính bằng PBKDF2-SHA-256 với 600.000 vòng.
- Mật khẩu chính không được tải lên Firebase và tác giả extension không thể khôi phục mật khẩu này.
- Cloud Firestore chỉ nhận envelope vault đã mã hóa và metadata phục vụ đồng bộ.

## 2. Information handled / Thông tin được xử lý

Aegis Vault may handle:

- Google account UID, email, display name and profile image for authentication and account display.
- Firebase ID token and refresh token for maintaining the signed-in session.
- Website origins required to match saved credentials for autofill.
- Encrypted vault data and synchronization versions in Cloud Firestore.
- Files explicitly imported or exported by the user.

Aegis Vault có thể xử lý:

- Firebase UID, email, tên hiển thị và ảnh đại diện của tài khoản Google.
- Firebase ID token và refresh token để duy trì phiên đăng nhập.
- Origin website cần thiết để khớp tài khoản khi autofill.
- Vault đã mã hóa và phiên bản đồng bộ trên Cloud Firestore.
- Các tệp do người dùng chủ động import hoặc export.

Aegis Vault does not sell personal data, use it for advertising, credit scoring or unrelated analytics.

Aegis Vault không bán dữ liệu cá nhân và không dùng dữ liệu cho quảng cáo, chấm điểm tín dụng hoặc phân tích không liên quan.

## 3. Local storage and authentication tokens / Lưu trữ local và token

- The encrypted vault is stored in `chrome.storage.local`.
- The unlocked master password is kept only in `chrome.storage.session` for the active browser session.
- Firebase tokens are stored in extension storage with access restricted to `TRUSTED_CONTEXTS`.
- Tokens are associated with the current Firebase UID and are deleted on sign-out.
- Content scripts cannot directly read the vault or authentication-token storage.

- Vault mã hóa được lưu trong `chrome.storage.local`.
- Mật khẩu chính sau khi mở khóa chỉ được giữ trong `chrome.storage.session` của phiên trình duyệt hiện tại.
- Firebase token được lưu trong extension storage và giới hạn quyền truy cập ở `TRUSTED_CONTEXTS`.
- Token được gắn với Firebase UID hiện tại và bị xóa khi đăng xuất.
- Content script không thể đọc trực tiếp vault hoặc token đăng nhập.

## 4. Cloud synchronization / Đồng bộ cloud

Cloud synchronization uses Firebase Authentication and Cloud Firestore.

- Data is encrypted before upload.
- Large encrypted envelopes are divided into Firestore chunk documents.
- Metadata updates use Firestore update-time preconditions to prevent blind overwrites.
- Old single-document snapshots remain readable for migration compatibility.

Đồng bộ cloud sử dụng Firebase Authentication và Cloud Firestore.

- Dữ liệu được mã hóa trước khi upload.
- Envelope mã hóa lớn được chia thành nhiều Firestore chunk document.
- Metadata dùng update-time precondition để tránh ghi đè mù.
- Snapshot một document của phiên bản cũ vẫn được đọc để tương thích migration.

Firebase and Google process authentication and cloud requests under their own privacy policies.

Firebase và Google xử lý yêu cầu đăng nhập/cloud theo chính sách quyền riêng tư của họ.

## 5. Website access and autofill / Truy cập website và autofill

- The content script runs on HTTPS pages and HTTP loopback pages used for development.
- Aegis examines form structure to identify login fields.
- Credentials are returned only after background origin validation and a user-triggered action.
- Aegis does not automatically submit login forms.
- Aegis does not build or sell browsing-history profiles.

- Content script chạy trên trang HTTPS và HTTP loopback dành cho phát triển.
- Aegis kiểm tra cấu trúc form để nhận diện trường đăng nhập.
- Credential chỉ được trả về sau khi background xác minh origin và có thao tác từ người dùng.
- Aegis không tự gửi form đăng nhập.
- Aegis không xây dựng hoặc bán hồ sơ lịch sử duyệt web.

## 6. Imports, exports and backups / Import, export và backup

- Encrypted Aegis backups remain protected by their backup password.
- CSV exports and OTP TXT exports can contain unencrypted secrets.
- Exported files are created only after an explicit user action.
- Users are responsible for securely storing or deleting exported files.

- Backup Aegis đã mã hóa vẫn được bảo vệ bằng mật khẩu backup.
- CSV export và OTP TXT export có thể chứa bí mật dạng rõ.
- Tệp export chỉ được tạo sau thao tác rõ ràng của người dùng.
- Người dùng chịu trách nhiệm lưu trữ hoặc xóa an toàn các tệp đã export.

## 7. Extension permissions / Quyền extension

- `storage`, `unlimitedStorage`: encrypted vault, settings, auth state and sync queue.
- `activeTab`, `scripting`: user-triggered page context and QR region selection.
- `identity`: Google OAuth sign-in.
- `alarms`: background synchronization and retries.
- `favicon`: saved-login site icons.
- `downloads`: backups, CSV and OTP exports.
- Firebase host permissions: Authentication token exchange, token refresh and Firestore sync.

## 8. Security limitations / Giới hạn bảo mật

Aegis Vault has not received an independent security audit. Users should keep encrypted backups and test recovery regularly. No software can guarantee protection against a compromised operating system, malicious browser, keylogger or exposed master password.

Aegis Vault chưa được kiểm toán bảo mật độc lập. Người dùng nên giữ backup mã hóa và kiểm tra khôi phục định kỳ. Phần mềm không thể bảo vệ tuyệt đối nếu hệ điều hành, trình duyệt hoặc mật khẩu chính đã bị xâm phạm.

## 9. Contact / Liên hệ

- Repository: [https://github.com/okebaybii/extensionpassword](https://github.com/okebaybii/extensionpassword)
- Issues: [https://github.com/okebaybii/extensionpassword/issues](https://github.com/okebaybii/extensionpassword/issues)
