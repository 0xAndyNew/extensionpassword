(() => {
  let activeDropdown = null;
  const send = message => chrome.runtime.sendMessage(message).catch(() => null);

  const getFields = () => [...document.querySelectorAll('input[type="password"]')];
  const findUsernameField = (pwInput) => {
    const form = pwInput.form || document;
    const candidates = [...form.querySelectorAll('input[type="email"], input[autocomplete="username"], input[type="text"]')];
    return candidates.filter(el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && !el.disabled && !el.readOnly;
    }).at(-1);
  };

  function setNativeValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Inject a small icon inside the input field
  function injectIcon(input) {
    if (input.dataset.aegisWired) return;
    input.dataset.aegisWired = '1';

    const icon = document.createElement('button');
    icon.type = 'button';
    icon.className = 'aegis-icon';
    icon.textContent = 'A';
    icon.title = 'Xem gợi ý tài khoản Aegis Vault';

    // Ngăn chặn sự kiện submit của form khi click icon
    icon.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      showSuggestions(input, icon);
    });

    // Chèn icon ngay sau input
    input.after(icon);

    // Định vị động icon để nó nằm ở góc trên bên phải, bên ngoài ô nhập
    function positionIcon() {
      const parent = input.parentElement;
      if (parent && window.getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
      }
      
      // Đặt icon nằm ở góc trên bên phải phía bên ngoài của ô nhập (khớp với hình vẽ bôi đỏ)
      const left = input.offsetLeft + input.offsetWidth + 6;
      const top = input.offsetTop;
      
      icon.style.left = `${left}px`;
      icon.style.top = `${top}px`;
    }

    // Định vị ban đầu và cập nhật liên tục khi focus/resize/hover
    positionIcon();
    input.addEventListener('focus', positionIcon);
    input.addEventListener('mouseenter', positionIcon);
    window.addEventListener('resize', positionIcon);
  }

  async function showSuggestions(input, icon) {
    closeDropdown();

    const response = await send({ type: 'MATCH', origin: location.origin });
    
    activeDropdown = document.createElement('div');
    activeDropdown.className = 'aegis-field-dropdown';

    if (!response?.ok) {
      // Trường hợp vault đang khóa hoặc chưa đăng nhập
      const button = document.createElement('button');
      button.type = 'button';
      button.style.textAlign = 'center';
      button.style.color = '#f8fafc';
      button.style.fontWeight = 'bold';
      button.innerHTML = `🔑 Aegis Vault đang khóa<br><span style="font-size:10px; font-weight:normal; color:#94a3b8;">Nhấp để mở khóa / Đăng nhập</span>`;
      button.onclick = (e) => {
        e.stopPropagation();
        send({ type: 'OPEN_OPTIONS' });
        closeDropdown();
      };
      activeDropdown.append(button);
    } else if (!response.credentials || !response.credentials.length) {
      // Trường hợp vault trống hoặc chưa lưu tài khoản cho web này
      const button = document.createElement('button');
      button.type = 'button';
      button.style.textAlign = 'center';
      button.style.color = '#f8fafc';
      button.style.fontWeight = 'bold';
      button.innerHTML = `➕ Chưa có tài khoản cho trang này<br><span style="font-size:10px; font-weight:normal; color:#94a3b8;">Nhấp để thêm tài khoản thủ công</span>`;
      button.onclick = (e) => {
        e.stopPropagation();
        send({ type: 'OPEN_OPTIONS' });
        closeDropdown();
      };
      activeDropdown.append(button);
    } else {
      // Có danh sách gợi ý tài khoản
      response.credentials.forEach(item => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = `${item.username} · ${item.title}`;
        button.onclick = async (e) => {
          e.stopPropagation();
          const result = await send({ type: 'FILL', id: item.id, origin: location.origin });
          if (result?.ok) {
            const usernameInput = findUsernameField(input);
            if (usernameInput) setNativeValue(usernameInput, result.credential.username);
            setNativeValue(input, result.credential.password);
            closeDropdown();
          }
        };
        activeDropdown.append(button);
      });
    }

    // Định vị dropdown ở dưới icon hoặc input
    document.body.appendChild(activeDropdown);
    const rect = input.getBoundingClientRect();
    
    // Tính toán tọa độ tuyệt đối trong trang (body coordinate)
    const top = rect.bottom + window.scrollY + 6;
    const left = rect.left + window.scrollX;
    
    Object.assign(activeDropdown.style, {
      top: `${top}px`,
      left: `${left}px`,
      minWidth: `${Math.max(220, rect.width)}px`
    });
  }

  function closeDropdown() {
    activeDropdown?.remove();
    activeDropdown = null;
  }

  // Chức năng custom save banner
  function showSaveBanner(username, password) {
    // Xóa banner cũ nếu có
    document.getElementById('aegisSaveBanner')?.remove();

    const banner = document.createElement('div');
    banner.id = 'aegisSaveBanner';
    banner.className = 'aegis-save-banner';

    banner.innerHTML = `
      <div class="aegis-banner-header">
        <div class="aegis-banner-logo">A</div>
        <div>
          <h4>Lưu tài khoản?</h4>
          <p>Lưu tài khoản này vào Aegis Vault?</p>
        </div>
      </div>
      <div class="aegis-banner-field">
        <label>Tên đăng nhập</label>
        <input type="text" id="aegisSaveUser" value="${username}">
      </div>
      <div class="aegis-banner-actions">
        <button class="btn-cancel" id="aegisSaveCancel">Bỏ qua</button>
        <button class="btn-save" id="aegisSaveConfirm">Lưu tài khoản</button>
      </div>
    `;

    document.body.appendChild(banner);

    document.getElementById('aegisSaveCancel').onclick = () => {
      banner.remove();
    };

    document.getElementById('aegisSaveConfirm').onclick = async () => {
      const finalUser = document.getElementById('aegisSaveUser').value.trim();
      if (finalUser) {
        await send({ type: 'SAVE', origin: location.origin, username: finalUser, password });
      }
      banner.remove();
    };
  }

  let lastCapturedCreds = null;
  let saveBannerTimeout = null;

  function captureAndTrigger(input) {
    const usernameEl = findUsernameField(input);
    const username = usernameEl?.value.trim() || '';
    const password = input.value;
    
    if (username && password) {
      if (lastCapturedCreds && lastCapturedCreds.username === username && lastCapturedCreds.password === password) {
        return;
      }
      lastCapturedCreds = { username, password };
      
      clearTimeout(saveBannerTimeout);
      saveBannerTimeout = setTimeout(async () => {
        // Kiểm tra xem tài khoản này (cả username và password) đã tồn tại trong vault chưa
        const check = await send({ type: 'CHECK_EXISTS', origin: location.origin, username, password });
        if (check?.ok && check.exists) {
          // Trùng khớp hoàn toàn -> Bỏ qua không hiện banner hỏi lưu nữa
          return;
        }
        showSaveBanner(username, password);
      }, 800);
    }
  }

  function wire() {
    getFields().forEach(input => {
      injectIcon(input);
      
      // 1. Phím Enter trong ô password
      if (!input.dataset.aegisEnterWired) {
        input.dataset.aegisEnterWired = '1';
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            captureAndTrigger(input);
          }
        });
      }
      
      // 2. Form Submit event
      const form = input.form;
      if (form && !form.dataset.aegisSubmitWired) {
        form.dataset.aegisSubmitWired = '1';
        form.addEventListener('submit', () => {
          captureAndTrigger(input);
        }, { capture: true });
      }

      // 3. Click chuột vào các nút bấm trong form/trang
      const container = form || document.body;
      if (container && !container.dataset.aegisClickWired) {
        container.dataset.aegisClickWired = '1';
        container.addEventListener('click', (e) => {
          const target = e.target.closest('button, input[type="submit"], input[type="button"], [role="button"]');
          if (target) {
            captureAndTrigger(input);
          }
        }, { capture: true });
      }
    });
  }

  // Lắng nghe thông báo từ popup (khi chọn tài khoản từ popup)
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'AEGIS_AUTOFILL') {
      const fields = getFields();
      if (fields.length) {
        const pwInput = fields[0];
        const usernameInput = findUsernameField(pwInput);
        if (usernameInput) setNativeValue(usernameInput, message.username);
        setNativeValue(pwInput, message.password);
      }
    }
  });

  // Tự động quét và liên kết
  wire();
  new MutationObserver(() => wire()).observe(document.documentElement, { childList: true, subtree: true });

  // Nhấp chuột bên ngoài để đóng dropdown
  document.addEventListener('mousedown', (e) => {
    if (activeDropdown && !activeDropdown.contains(e.target) && !e.target.classList.contains('aegis-icon')) {
      closeDropdown();
    }
  });
})();
