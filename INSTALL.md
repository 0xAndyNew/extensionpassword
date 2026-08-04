# Cài đặt Aegis Vault

Aegis Vault hỗ trợ Google Chrome 106 trở lên và Microsoft Edge Chromium tương đương. Extension sử dụng Firebase Authentication để đăng nhập Google và Cloud Firestore để đồng bộ vault đã mã hóa.

## 1. Chuẩn bị Firebase

### Tạo Web App

1. Tạo hoặc mở một Firebase project.
2. Thêm một Web App trong Project Settings.
3. Sao chép cấu hình Web App.
4. Tạo file local:

   ```powershell
   Copy-Item src/auth/firebase-config.example.js src/auth/firebase-config.js
   ```

5. Điền cấu hình thật vào `src/auth/firebase-config.js`.

File này bị Git bỏ qua và không nên commit.

### Bật Authentication

1. Mở **Firebase Console → Authentication → Sign-in method**.
2. Bật nhà cung cấp Google.
3. Chọn email hỗ trợ của project.

### Tạo Cloud Firestore

Tạo Firestore database và áp dụng rules giới hạn dữ liệu theo Firebase UID:

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

Vault được lưu theo cấu trúc:

```text
users/{uid}/vault/snapshot
users/{uid}/vault/snapshot/chunks/{commitId}_{index}
```

Document `snapshot` chứa metadata của commit. Envelope mã hóa được chia thành các chunk nhỏ để không vượt giới hạn kích thước document của Firestore.

## 2. Cấu hình Google OAuth

Aegis dùng OAuth Web Client với `chrome.identity.launchWebAuthFlow` trên cả Chrome và Edge.

Client ID được khai báo tại:

```json
{
  "oauth2": {
    "client_id": "YOUR_WEB_CLIENT_ID.apps.googleusercontent.com",
    "scopes": ["openid", "email", "profile"]
  }
}
```

Redirect URI được tạo bằng:

```js
chrome.identity.getRedirectURL('oauth2')
```

Kết quả có dạng:

```text
https://<extension-id>.chromiumapp.org/oauth2
```

Thêm chính xác URI này vào **Google Cloud Console → Google Auth Platform → Clients → Authorized redirect URIs**.

Extension ID hiện được xác định từ public `key` trong `manifest.json`. Không thay public key nếu muốn giữ nguyên ID và redirect URI.

Không đưa private key `.pem` vào repository hoặc package.

## 3. Load unpacked

1. Mở `chrome://extensions/` hoặc `edge://extensions/`.
2. Bật **Developer mode**.
3. Chọn **Load unpacked**.
4. Chọn thư mục dự án chứa `manifest.json`.
5. Sau mỗi lần sửa mã nguồn, bấm **Reload** trên thẻ Aegis Vault.

Không cần chạy build hoặc tạo ZIP khi đang phát triển.

## 4. Kiểm tra đăng nhập

1. Mở popup Aegis Vault.
2. Chọn đăng nhập Google.
3. Xác nhận đúng tài khoản Google.
4. Kiểm tra Firebase Authentication đã tạo user.
5. Tạo vault thử nghiệm.
6. Kiểm tra Firestore có document dưới `users/{uid}/vault/snapshot`.

OAuth chỉ yêu cầu ID token, email và profile. Aegis xác minh `state` của phản hồi OAuth trước khi trao đổi ID token với Firebase Authentication.

## 5. Kiểm tra đồng bộ

1. Tạo vault và thêm một tài khoản thử nghiệm.
2. Chờ trạng thái đồng bộ hoàn tất.
3. Reload extension và mở lại vault.
4. Thử trên trình duyệt hoặc profile thứ hai với cùng tài khoản Google.
5. Sửa dữ liệu trên hai profile để kiểm tra conflict handling.

Firestore write sử dụng server-side precondition:

- `currentDocument.exists=false` khi tạo snapshot mới.
- `currentDocument.updateTime=<version>` khi cập nhật snapshot.

Nếu phiên bản cloud đã đổi, Aegis không ghi đè mù mà tải lại snapshot và giữ pending mutations để hợp nhất hoặc retry.

## 6. Token và đăng xuất

- Firebase ID token và refresh token được lưu trong Chrome Storage với access level `TRUSTED_CONTEXTS`.
- Token được gắn với Firebase UID của user hiện tại.
- Token hết hạn không được tái sử dụng nếu refresh thất bại.
- Nút đăng xuất xóa user và token khỏi local/session storage.

Nếu không đăng nhập lại được:

1. Kiểm tra OAuth Client ID.
2. Kiểm tra redirect URI theo Extension ID hiện tại.
3. Kiểm tra Google provider trong Firebase Authentication.
4. Kiểm tra `apiKey` và `projectId` trong `firebase-config.js`.
5. Kiểm tra Firebase Authentication và Firestore API chưa bị chặn bởi quota hoặc API restrictions.

## 7. Chạy kiểm thử

```powershell
npm.cmd run check
npm.cmd test
```

Chỉ đóng gói sau khi toàn bộ test và kiểm thử Chrome/Edge hoàn tất.

## 8. Đóng gói khi phát hành

```powershell
npm.cmd run build
```

Kết quả:

```text
dist/aegis-vault/
dist/aegis-vault.zip
```

Script đóng gói dừng nếu phát hiện private key `.pem` hoặc `.key`.
