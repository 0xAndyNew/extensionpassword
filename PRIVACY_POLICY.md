# Aegis Vault - Privacy Policy (Chính Sách Quyền Riêng Tư)

**Effective Date / Ngày có hiệu lực**: July 29, 2026 / 29 tháng 07 năm 2026

Aegis Vault ("we", "our", or "extension") is committed to protecting your privacy and security. This Privacy Policy explains how Aegis Vault handles your data when you use our Chrome Extension.

Aegis Vault được xây dựng theo triết lý **Zero-Knowledge Architecture & Local-First Security** (Mã hóa tuyệt đối & Ưu tiên thiết bị cục bộ). Chúng tôi cam kết bảo vệ toàn vẹn dữ liệu cá nhân của bạn.

---

## 1. Zero-Knowledge Encryption (Mã Hóa Không Truy Cập)

- **Local Encryption**: All password vault items, OTP secrets, notes, and credentials are encrypted on your local device using **AES-GCM 256-bit** encryption with **PBKDF2** key derivation (100,000 iterations).
- **Master Password Security**: Your Master Password is NEVER transmitted to any server, stored on any remote cloud, or accessed by the author. Only you hold the decryption key.

*(Mọi mật khẩu, mã OTP và ghi chú của bạn đều được mã hóa cục bộ bằng thuật toán AES-GCM 256-bit. Mật khẩu chính của bạn không bao giờ bị gửi đi bất kỳ đâu).*

---

## 2. Information We Handle (Dữ Liệu Được Xử Lý)

Aegis Vault does NOT collect, track, buy, or sell your personal data to third parties.

1. **User Identity Info**: When you choose to enable Firebase Cloud Sync, we access your Google Account Identity (email and user ID) solely to manage your isolated cloud vault backup.
2. **Credentials & Auth Data**: Saved logins and OTP tokens are strictly stored locally in encrypted storage.
3. **No Web Browsing History Collected**: We do NOT track or record your browsing history or visited page contents.

*(Aegis Vault không thu thập, bán hay chia sẻ dữ liệu cá nhân cho bên thứ ba. Khi chọn đồng bộ Firebase, tiện ích chỉ sử dụng thông tin định danh tài khoản Google để tạo nhánh lưu trữ mã hóa riêng cho bạn).*

---

## 3. Extension Permissions (Giải Thích Quyền Tiện Ích)

Aegis Vault requests only the minimum set of permissions required to deliver its features:

- `storage` & `unlimitedStorage`: To store your encrypted vault locally on your browser.
- `activeTab` & `scripting`: To detect login form fields for credential autofill and power the on-screen QR code scanner when requested by you.
- `identity`: To authenticate with official Google OAuth services for optional cloud sync.
- `alarms`: To compute realtime 2FA OTP TOTP code expiration countdowns (30 seconds) and run background sync checks.
- `favicon`: To display domain icons for saved logins.
- `host_permissions` (`https://*/*`): To recognize login forms on HTTPS web origins for password autofill.

---

## 4. Optional Cloud Synchronization (Đồng Bộ Đám Mây Tùy Chọn)

If you enable Cloud Sync via Firebase:
- Vault data is encrypted BEFORE leaving your device.
- The remote stored payload is an authenticated encrypted envelope that cannot be decrypted without your Master Password.

---

## 5. Compliance Certifications (Cam Kết Tuân Thủ)

We certify that Aegis Vault:
- Does NOT sell or transfer user data to third parties.
- Does NOT use user data for purposes unrelated to the primary functionality of password and 2FA management.
- Does NOT process user data for creditworthiness or lending decisions.
- Complies strictly with Chrome Web Store Developer Program Policies.

---

## 6. Open Source & Contact (Liên Hệ & Mã Nguồn)

Aegis Vault is open-source software. You can inspect the source code and review privacy practices on GitHub:
- **Repository**: [https://github.com/okebaybii/extensionpassword](https://github.com/okebaybii/extensionpassword)
- **Issues / Support**: [https://github.com/okebaybii/extensionpassword/issues](https://github.com/okebaybii/extensionpassword/issues)
