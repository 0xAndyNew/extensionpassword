# Aegis Vault

Aegis Vault là tiện ích quản lý mật khẩu và mã OTP dành cho Google Chrome và Microsoft Edge Chromium. Dữ liệu được lưu local-first, mã hóa trước khi ghi xuống thiết bị hoặc đồng bộ lên Firebase Cloud Firestore.

Phiên bản hiện tại: `0.3.91`.

## Trạng thái dự án

Dự án đang trong giai đoạn phát triển và kiểm thử. Không nên dùng Aegis Vault làm nơi lưu duy nhất cho dữ liệu quan trọng cho đến khi các giới hạn đồng bộ trong phần [Điểm cần lưu ý](#điểm-cần-lưu-ý) được xử lý.

## Tính năng

- Quản lý tài khoản đăng nhập, ghi chú bảo mật, thẻ thanh toán và mã OTP/TOTP.
- Mã hóa vault bằng AES-256-GCM.
- Dẫn xuất khóa từ mật khẩu chính bằng PBKDF2-SHA-256 với 600.000 vòng.
- Lưu dữ liệu trên thiết bị trước, sau đó tự đồng bộ bản mã hóa lên Cloud Firestore.
- Đăng nhập Google thông qua Firebase Authentication.
- Tự động điền tài khoản sau thao tác trực tiếp của người dùng; không tự gửi biểu mẫu.
- Nhận diện website theo `scheme + hostname + port`, không tự ghép các subdomain khác nhau.
- Nhận diện thông tin đăng nhập mới hoặc mật khẩu vừa thay đổi để đề nghị lưu.
- Tạo mật khẩu ngẫu nhiên với độ dài và nhóm ký tự tùy chọn.
- Tạo, sửa, sắp xếp, sao chép và xóa mã OTP.
- Nhập OTP bằng URI `otpauth://`, tệp TXT, ảnh QR hoặc khoanh vùng QR trên trang web.
- Import/export CSV, export OTP và backup vault đã mã hóa.
- Thùng rác cho tài khoản, ghi chú, thẻ và OTP.
- Báo cáo mật khẩu yếu, trung bình, mạnh hoặc bị dùng lại.
- Giao diện tiếng Việt và tiếng Anh; nội dung động và lỗi nền dùng cùng ngôn ngữ đã chọn.

## Kiến trúc dữ liệu

```text
Popup / Dashboard / Content script
                |
                v
        Background service worker
          |                   |
          v                   v
chrome.storage.local    Firebase Authentication
  vault đã mã hóa              |
                               v
                    Cloud Firestore
                    users/{uid}/vault/snapshot
                    users/{uid}/vault/snapshot/chunks/*
```

- Vault rõ chỉ tồn tại trong bộ nhớ khi đang mở khóa.
- Mật khẩu chính không được gửi lên Firebase và không có cơ chế khôi phục.
- Dữ liệu đồng bộ là envelope đã mã hóa, không phải tài khoản hoặc OTP dạng rõ.
- Mỗi Firebase UID có metadata snapshot riêng; envelope lớn được chia thành các chunk document bất biến.
- Snapshot metadata dùng Firestore `currentDocument.updateTime` để chống ghi đè đồng thời.
- Firebase ID token và refresh token được lưu trong Chrome Storage với quyền truy cập giới hạn cho trusted extension contexts.

## Yêu cầu

- Google Chrome `106+` hoặc Microsoft Edge Chromium tương đương.
- Node.js để chạy kiểm thử và công cụ phát triển.
- Một Firebase project có Authentication và Cloud Firestore.
- Một Google OAuth Web Client dùng cho `chrome.identity.launchWebAuthFlow`.

## Cài đặt từ mã nguồn

1. Clone repository:

   ```powershell
   git clone https://github.com/okebaybii/extensionpassword.git
   cd extensionpassword
   ```

2. Tạo cấu hình Firebase local:

   ```powershell
   Copy-Item src/auth/firebase-config.example.js src/auth/firebase-config.js
   ```

3. Điền cấu hình Web App của Firebase vào `src/auth/firebase-config.js`.

4. Cập nhật `oauth2.client_id` trong `manifest.json` nếu dùng OAuth client khác.

5. Mở `chrome://extensions/` hoặc `edge://extensions/`.

6. Bật **Developer mode** và chọn **Load unpacked**.

7. Chọn thư mục dự án chứa `manifest.json`.

Sau khi sửa mã nguồn, bấm **Reload** trên thẻ Aegis Vault. Không cần đóng gói ZIP trong quá trình phát triển.

## Cấu hình Firebase

### 1. Authentication

- Bật Firebase Authentication.
- Bật nhà cung cấp Google.
- Thêm domain/redirect URI của extension vào cấu hình OAuth Web Client.
- Redirect URI được tạo bởi:

  ```js
  chrome.identity.getRedirectURL('oauth2')
  ```

URI thường có dạng:

```text
https://<extension-id>.chromiumapp.org/oauth2
```

Extension ID phải ổn định và redirect URI phải khớp chính xác với cấu hình trong Google Cloud Console.

### 2. Cloud Firestore

Tạo Firestore database và chỉ cho phép người dùng truy cập document thuộc UID của chính họ. Rules tối thiểu có thể bắt đầu như sau:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/vault/{document=**} {
      allow read, write: if request.auth != null
                         && request.auth.uid == userId;
    }
  }
}
```

Hãy kiểm tra rules bằng Firebase Emulator hoặc Rules Playground trước khi triển khai production.

### 3. File cấu hình local

`src/auth/firebase-config.js` bị loại khỏi Git và không nên commit. Firebase Web API key không phải private key, nhưng vẫn nên giới hạn API, referrer và quota trong Google Cloud.

Không đưa các tệp sau vào repository hoặc gói phát hành:

- Private key `.pem`, `.key`, `.p12`.
- Service-account JSON.
- Backup chứa dữ liệu thật.
- File `.env` hoặc cấu hình môi trường production không cần thiết.

## Sử dụng

### Tạo hoặc mở khóa vault

1. Mở popup Aegis Vault.
2. Đăng nhập tài khoản Google.
3. Tạo vault mới hoặc nhập mật khẩu chính để mở vault hiện có.
4. Dùng mật khẩu chính dài, duy nhất và nên có ít nhất 12 ký tự.

Mã nguồn hiện chấp nhận tối thiểu 6 ký tự để tương thích dữ liệu cũ, nhưng đây không phải mức khuyến nghị an toàn.

### Quản lý tài khoản

- Thêm website, tên đăng nhập, mật khẩu, ghi chú và OTP liên kết nếu cần.
- Click tài khoản trong popup để xem hoặc sao chép thông tin.
- Click chuột phải để mở website sau bước xác nhận.
- Trên trang đăng nhập, chọn biểu tượng Aegis để điền tài khoản phù hợp.

### Quản lý OTP

- Thêm thủ công bằng Base32 hoặc URI `otpauth://`.
- Import ảnh QR từ popup.
- Khoanh vùng QR trên trang đang mở.
- Click mã OTP để sao chép.
- Kéo thẻ OTP để thay đổi thứ tự.

### Backup và xuất dữ liệu

- Backup Aegis là bản vault đã mã hóa và cần đúng mật khẩu để khôi phục.
- CSV và tệp OTP export có thể chứa bí mật dạng rõ; chỉ tạo khi thực sự cần và xóa an toàn sau khi sử dụng.
- Luôn giữ ít nhất một backup mã hóa độc lập với Firestore.

## Quyền extension

| Quyền | Mục đích |
| --- | --- |
| `storage` | Lưu vault mã hóa, trạng thái phiên, cấu hình và hàng đợi đồng bộ |
| `unlimitedStorage` | Tránh quota nhỏ của storage đối với vault local |
| `activeTab` | Đọc ngữ cảnh tab hiện tại sau thao tác người dùng |
| `scripting` | Chèn công cụ chọn QR vào tab đang mở |
| `alarms` | Đồng bộ nền và retry có kiểm soát |
| `identity` | Mở luồng đăng nhập Google OAuth |
| `favicon` | Hiển thị favicon cho tài khoản đã lưu |
| `downloads` | Tải backup, CSV và tệp OTP |

Content script chỉ được khai báo cho HTTPS và HTTP loopback phục vụ phát triển.

## Phát triển và kiểm thử

Cài dependency nếu cần, sau đó chạy:

```powershell
npm run check
npm test
```

Trên Windows có Execution Policy chặn `npm.ps1`, dùng:

```powershell
npm.cmd run check
npm.cmd test
```

Bộ test hiện kiểm tra mã hóa, repository local-first, đồng bộ, xung đột, OTP, CSV, policy message, autofill, QR và i18n.

## Đóng gói

Chỉ đóng gói khi đã hoàn tất kiểm thử:

```powershell
npm run build
```

Kết quả được tạo tại:

```text
dist/aegis-vault/
dist/aegis-vault.zip
```

Script đóng gói từ chối các tệp private key có phần mở rộng `.pem` hoặc `.key`.

## Điểm cần lưu ý

### Đồng bộ nhiều thiết bị

Aegis sử dụng immutable chunks, metadata commit, update-time precondition, lineage và pending mutation queue. Khi snapshot cloud đã thay đổi, extension dừng ghi, tải lại phiên bản mới và hợp nhất hoặc giữ dữ liệu chờ retry thay vì ghi đè mù.

Snapshot một document của phiên bản cũ vẫn được đọc. Lần upload tiếp theo tự chuyển dữ liệu sang định dạng chunked.

### Dữ liệu identity cũ

Repository vẫn đọc dữ liệu identity cũ để tương thích, nhưng giao diện chỉnh sửa identity cá nhân đã được gỡ. README không coi đây là tính năng đang hỗ trợ.

## Tài liệu liên quan

- `INSTALL.md`: cấu hình Firebase Authentication, Firestore, OAuth và Extension ID.
- `PRIVACY_POLICY.md`: chính sách quyền riêng tư.
- `CHROME_STORE_DESCRIPTION.md`: nội dung mô tả dành cho Chrome Web Store.

## Cảnh báo

Aegis Vault là phần mềm tự quản lý dữ liệu và chưa được kiểm toán bảo mật độc lập. Hãy giữ backup mã hóa, kiểm tra khả năng khôi phục định kỳ và không dùng bản phát triển làm nơi lưu duy nhất cho thông tin quan trọng.
