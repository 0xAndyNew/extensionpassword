const AUTH_KEY = 'aegisGoogleUser';
const TOKEN_KEY = 'aegisGoogleToken';

export async function getGoogleUser() { return (await chrome.storage.session.get(AUTH_KEY))[AUTH_KEY] || null; }

export async function signInWithGoogle() {
  const clientId = chrome.runtime.getManifest().oauth2?.client_id;
  if (!clientId || clientId.includes('REPLACE')) throw new Error('Chưa cấu hình Google OAuth Client ID trong manifest.json.');
  
  // Lấy redirect URI được định cấu hình tự động bởi Chrome cho extension
  const redirectUri = chrome.identity.getRedirectURL();
  
  // Tạo URL đăng nhập Google OAuth 2.0 với prompt=select_account để bắt buộc hiển thị màn hình chọn tài khoản
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth` +
    `?client_id=${clientId}` +
    `&response_type=token` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent('openid email profile https://www.googleapis.com/auth/drive.appdata')}` +
    `&prompt=select_account`;

  // Gọi launchWebAuthFlow để mở popup đăng nhập và chọn tài khoản
  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl,
    interactive: true
  });

  if (!responseUrl) {
    throw new Error('Đăng nhập Google bị hủy hoặc không thành công.');
  }

  // Lấy access token từ URL trả về (nằm ở hash part của URL)
  const url = new URL(responseUrl);
  const params = new URLSearchParams(url.hash.substring(1));
  const accessToken = params.get('access_token');
  if (!accessToken) {
    throw new Error('Không lấy được mã xác thực (Access Token) từ Google.');
  }

  // Lấy thông tin cá nhân của người dùng bằng token vừa nhận
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { 
    headers: { Authorization: `Bearer ${accessToken}` } 
  });
  if (!response.ok) {
    throw new Error('Không lấy được thông tin tài khoản Google.');
  }
  
  const profile = await response.json();
  const user = { sub: profile.sub, email: profile.email, name: profile.name, picture: profile.picture };
  
  await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {});
  await chrome.storage.session.set({ [AUTH_KEY]: user, [TOKEN_KEY]: accessToken });
  return user;
}

export async function signOutGoogle() {
  const accessToken = (await chrome.storage.session.get(TOKEN_KEY))[TOKEN_KEY] || null;
  
  if (accessToken) {
    // Thu hồi token phía Google để xóa phiên
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `token=${accessToken}`
    }).catch(() => null);
  }
  
  await chrome.storage.session.remove([AUTH_KEY, TOKEN_KEY]);
}


