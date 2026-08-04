# Aegis Vault - Chrome Web Store Content

## Tiếng Việt

### Tên

```text
Aegis Vault - Quản lý mật khẩu & OTP 2FA
```

### Mô tả ngắn

```text
Quản lý mật khẩu local-first, OTP 2FA, quét QR và đồng bộ vault mã hóa an toàn với Firebase.
```

### Mô tả chi tiết

```text
Aegis Vault là tiện ích quản lý mật khẩu và mã OTP dành cho Chrome và trình duyệt Chromium.

MÃ HÓA TRÊN THIẾT BỊ
- Vault được mã hóa bằng AES-256-GCM trước khi lưu hoặc đồng bộ.
- Khóa được dẫn xuất từ mật khẩu chính bằng PBKDF2-SHA-256 với 600.000 vòng.
- Mật khẩu chính không được gửi lên Firebase và không có cơ chế khôi phục.

QUẢN LÝ TÀI KHOẢN
- Lưu website, tên đăng nhập, mật khẩu và ghi chú.
- Autofill theo đúng origin sau thao tác của người dùng.
- Đề nghị lưu tài khoản mới hoặc mật khẩu vừa thay đổi.
- Trình tạo mật khẩu với độ dài và nhóm ký tự tùy chọn.

OTP 2FA VÀ QR
- Tạo mã TOTP theo RFC 6238 với vòng đếm ngược.
- Thêm OTP bằng Base32 hoặc URI otpauth://.
- Import ảnh QR hoặc khoanh vùng QR trực tiếp trên trang đang mở.
- Sắp xếp, tìm kiếm và sao chép OTP nhanh chóng.

LOCAL-FIRST VÀ FIRESTORE
- Thay đổi được mã hóa và lưu trên thiết bị trước.
- Bản mã hóa được đồng bộ bằng Firebase Authentication và Cloud Firestore.
- Vault lớn được chia thành nhiều chunk document.
- Update-time precondition và pending mutation queue giúp tránh ghi đè mù khi nhiều thiết bị đồng bộ.

BACKUP VÀ KIỂM TRA BẢO MẬT
- Backup/restore vault đã mã hóa.
- Import/export CSV và OTP khi người dùng chủ động yêu cầu.
- Phát hiện mật khẩu yếu hoặc bị dùng lại.
- Thùng rác cho các mục đã xóa.

NGÔN NGỮ
- Hỗ trợ giao diện tiếng Việt và tiếng Anh.

Aegis Vault chưa được kiểm toán bảo mật độc lập. Hãy giữ backup mã hóa và không dùng bản phát triển làm nơi lưu duy nhất cho dữ liệu quan trọng.
```

## English

### Title

```text
Aegis Vault - Password Manager & 2FA OTP
```

### Short description

```text
Local-first password manager with 2FA OTP, QR scanning, and encrypted Firebase vault synchronization.
```

### Detailed description

```text
Aegis Vault is a password and OTP manager for Chrome and Chromium-based browsers.

ON-DEVICE ENCRYPTION
- The vault is encrypted with AES-256-GCM before local storage or cloud synchronization.
- The encryption key is derived from the master password with 600,000 PBKDF2-SHA-256 iterations.
- The master password is not uploaded to Firebase and cannot be recovered.

LOGIN MANAGEMENT
- Store websites, usernames, passwords and notes.
- Fill credentials for the exact matching origin after a user action.
- Offer to save new logins or recently changed passwords.
- Generate passwords with configurable length and character groups.

2FA OTP AND QR SCANNING
- Generate RFC 6238 TOTP codes with a visual countdown.
- Add OTP accounts using Base32 secrets or otpauth:// URIs.
- Import QR images or select a QR region directly on the current page.
- Search, reorder and copy OTP codes.

LOCAL-FIRST FIRESTORE SYNC
- Changes are encrypted and saved on the device first.
- Encrypted data is synchronized through Firebase Authentication and Cloud Firestore.
- Large vault envelopes are stored as multiple chunk documents.
- Update-time preconditions and a pending mutation queue protect against blind concurrent overwrites.

BACKUP AND SECURITY REVIEW
- Create and restore encrypted Aegis backups.
- Import or export CSV and OTP files after explicit user actions.
- Detect weak or reused passwords.
- Restore recently deleted items from trash.

LANGUAGES
- English and Vietnamese interface support.

Aegis Vault has not received an independent security audit. Keep encrypted backups and do not rely on a development build as the only copy of important data.
```

## Store metadata

- Category: Productivity.
- Data usage: authentication identity, website origins for autofill, encrypted vault synchronization and user-requested imports/exports.
- No advertising, sale of user data or unrelated analytics.
- Privacy policy: `PRIVACY_POLICY.md`.
- Support: [GitHub Issues](https://github.com/okebaybii/extensionpassword/issues).
