/**
 * Google Drive AppData Folder API client
 */

export async function findVaultFile(accessToken, filename) {
  const query = encodeURIComponent(`name = '${filename}' and 'appDataFolder' in parents`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&spaces=appDataFolder&fields=files(id,name)`;
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  
  if (!response.ok) {
    throw new Error('Không thể tìm kiếm tệp trên Google Drive.');
  }
  
  const data = await response.json();
  return data.files && data.files.length > 0 ? data.files[0] : null;
}

export async function readVaultFile(accessToken, fileId) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  
  if (!response.ok) {
    throw new Error('Không thể tải dữ liệu từ Google Drive.');
  }
  
  return response.json();
}

export async function writeVaultFile(accessToken, filename, contentObj) {
  // 1. Tìm xem tệp đã tồn tại chưa
  const file = await findVaultFile(accessToken, filename);
  
  if (file) {
    // 2. Nếu đã tồn tại, thực hiện cập nhật nội dung
    const url = `https://www.googleapis.com/upload/drive/v3/files/${file.id}?uploadType=media`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(contentObj)
    });
    
    if (!response.ok) {
      throw new Error('Không thể cập nhật tệp trên Google Drive.');
    }
  } else {
    // 3. Nếu chưa tồn tại, tạo mới
    // Bước A: Tạo metadata tệp
    const metaUrl = 'https://www.googleapis.com/drive/v3/files';
    const metaResponse = await fetch(metaUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: filename,
        parents: ['appDataFolder']
      })
    });
    
    if (!metaResponse.ok) {
      throw new Error('Không thể tạo metadata tệp trên Google Drive.');
    }
    
    const metaData = await metaResponse.json();
    const fileId = metaData.id;
    
    // Bước B: Tải nội dung tệp lên
    const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(contentObj)
    });
    
    if (!uploadResponse.ok) {
      throw new Error('Không thể tải nội dung tệp lên Google Drive.');
    }
  }
}
