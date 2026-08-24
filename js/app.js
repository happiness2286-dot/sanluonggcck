// Core Application Logic for Mini App GCCK 2026 (Full MES & Auth Enhanced)

const DEFAULT_GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyaHrvXtTVL1i_B3ohANN6E5--aTewsqa_gvlH85l_4xP9vpDWdrG_RM6BSlx_Y472B/exec';

document.addEventListener('DOMContentLoaded', () => {
    // Tự động đồng bộ URL Google Apps Script mới nhất cho mọi thiết bị
    localStorage.setItem('GOOGLE_SCRIPT_URL', DEFAULT_GOOGLE_SCRIPT_URL);

    // Helper: Normalize Vietnamese Unicode (NFC/NFD) and strip non-alphanumeric characters for robust mobile matching
    window.cleanKey = function(str) {
        if (!str) return '';
        return str.toString()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/đ/g, "d").replace(/Đ/g, "D")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
    };

    // Helper: Find exact or canonical key for Products & Customers flexible lookup
    window.getCanonicalProductKey = function(productName) {
        if (!productName) return '';
        const trimP = productName.trim();
        if (!window.AppData || !window.AppData.operationsByProduct) return trimP;
        if (window.AppData.operationsByProduct[trimP]) return trimP;
        const targetClean = window.cleanKey(trimP);
        const foundKey = Object.keys(window.AppData.operationsByProduct).find(k => 
            window.cleanKey(k) === targetClean
        );
        return foundKey || trimP;
    };

    window.getCanonicalCustomerKey = function(customerName) {
        if (!customerName) return '';
        const trimC = customerName.trim();
        if (!window.AppData || !window.AppData.productsByCustomer) return trimC;
        if (window.AppData.productsByCustomer[trimC]) return trimC;
        const targetClean = window.cleanKey(trimC);
        const foundKey = Object.keys(window.AppData.productsByCustomer).find(k => 
            window.cleanKey(k) === targetClean
        );
        return foundKey || trimC;
    };

    // 1. Initialize State from LocalStorage or INITIAL_DATA
    const savedData = localStorage.getItem('GCCK_APP_DATA');
    if (savedData) {
        try {
            window.AppData = JSON.parse(savedData);
            window.AppData.googleScriptUrl = DEFAULT_GOOGLE_SCRIPT_URL;

            // Auto-sync missing master data from INITIAL_DATA into AppData for old products
            if (window.INITIAL_DATA) {
                if (window.INITIAL_DATA.customers) {
                    if (!window.AppData.customers) window.AppData.customers = [];
                    window.INITIAL_DATA.customers.forEach(c => {
                        if (!window.AppData.customers.includes(c)) window.AppData.customers.push(c);
                    });
                }
                if (window.INITIAL_DATA.productsByCustomer) {
                    if (!window.AppData.productsByCustomer) window.AppData.productsByCustomer = {};
                    Object.keys(window.INITIAL_DATA.productsByCustomer).forEach(cust => {
                        const targetClean = window.cleanKey(cust);
                        const existingKey = Object.keys(window.AppData.productsByCustomer).find(k => window.cleanKey(k) === targetClean);
                        const initProds = window.INITIAL_DATA.productsByCustomer[cust];

                        if (!existingKey) {
                            window.AppData.productsByCustomer[cust] = [...initProds];
                        } else {
                            const arr = window.AppData.productsByCustomer[existingKey];
                            initProds.forEach(p => {
                                const pClean = window.cleanKey(p);
                                if (!arr.some(item => window.cleanKey(item) === pClean)) {
                                    arr.push(p);
                                }
                            });
                        }
                    });
                }
                if (window.INITIAL_DATA.operationsByProduct) {
                    if (!window.AppData.operationsByProduct) window.AppData.operationsByProduct = {};
                    Object.keys(window.INITIAL_DATA.operationsByProduct).forEach(prod => {
                        const targetClean = window.cleanKey(prod);
                        const existingKey = Object.keys(window.AppData.operationsByProduct).find(k => window.cleanKey(k) === targetClean);
                        const initOps = window.INITIAL_DATA.operationsByProduct[prod];

                        if (!existingKey) {
                            window.AppData.operationsByProduct[prod] = [...initOps];
                        } else {
                            const arr = window.AppData.operationsByProduct[existingKey];
                            if (Array.isArray(initOps) && Array.isArray(arr)) {
                                initOps.forEach(item => {
                                    const opName = typeof item === 'string' ? item : (item ? item.op : '');
                                    const opClean = window.cleanKey(opName);
                                    if (opName && !arr.some(o => window.cleanKey(typeof o === 'string' ? o : o.op) === opClean)) {
                                        arr.push(item);
                                    }
                                });
                            }
                        }
                    });
                }
                if (window.INITIAL_DATA.operationWages) {
                    if (!window.AppData.operationWages) window.AppData.operationWages = {};
                    Object.assign(window.AppData.operationWages, window.INITIAL_DATA.operationWages);
                }
                localStorage.setItem('GCCK_APP_DATA', JSON.stringify(window.AppData));
            }
        } catch (e) {
            window.AppData = window.INITIAL_DATA;
        }
    } else {
        window.AppData = window.INITIAL_DATA;
        localStorage.setItem('GCCK_APP_DATA', JSON.stringify(window.AppData));
    }

    // Ensure userAccounts is guaranteed to be present and populated
    if (!window.AppData.userAccounts || window.AppData.userAccounts.length === 0) {
        window.AppData.userAccounts = (window.INITIAL_DATA && window.INITIAL_DATA.userAccounts) ? window.INITIAL_DATA.userAccounts : [];
        localStorage.setItem('GCCK_APP_DATA', JSON.stringify(window.AppData));
    }

    // App state
    let currentUser = JSON.parse(localStorage.getItem('GCCK_CURRENT_USER')) || null;
    let currentRole = currentUser ? currentUser.role : 'worker';
    let inputMode = 'tap'; // 'qr' or 'tap'
    let attachedPhotos = [];
    let attachedProductPhotos = [];
    
    // Stopwatch timer state
    let timerInterval = null;
    let timerSeconds = 0;
    let isTimerRunning = false;

    // 2. Elements Mapping
    const loginModal = document.getElementById('loginModal');
    const loginUsernameInput = document.getElementById('loginUsername');
    const loginPasswordInput = document.getElementById('loginPassword');
    const btnLoginSubmit = document.getElementById('btnLoginSubmit');

    const userHeaderBadge = document.getElementById('userHeaderBadge');
    const currentUserNameLabel = document.getElementById('currentUserNameLabel');
    const currentUserRoleTag = document.getElementById('currentUserRoleTag');
    const btnLogout = document.getElementById('btnLogout');

    const workerTabBtn = document.getElementById('workerTabBtn');
    const adminTabBtn = document.getElementById('adminTabBtn');
    const workerSection = document.getElementById('workerSection');
    const adminSection = document.getElementById('adminSection');

    const methodTapBtn = document.getElementById('methodTapBtn');
    const methodQrBtn = document.getElementById('methodQrBtn');
    const qrBannerBox = document.getElementById('qrBannerBox');
    const manualFormBox = document.getElementById('manualFormBox');
    const reportDateInput = document.getElementById('reportDateInput');

    function getTodayDateString() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    if (reportDateInput && !reportDateInput.value) {
        reportDateInput.value = getTodayDateString();
    }

    // Cascade Selects
    const customerSelect = document.getElementById('customerSelect');
    const productSelect = document.getElementById('productSelect');
    const operationSelect = document.getElementById('operationSelect');
    const machineSelect = document.getElementById('machineSelect');
    const materialSelect = document.getElementById('materialSelect');
    const materialUnitLabel = document.getElementById('materialUnitLabel');
    const wipStockBadge = document.getElementById('wipStockBadge');
    const wipStockCount = document.getElementById('wipStockCount');
    const toolWearAlert = document.getElementById('toolWearAlert');

    // Quantities
    const qtyDatInput = document.getElementById('qtyDatInput');
    const qtyXuLyInput = document.getElementById('qtyXuLyInput');
    const qtyHuyInput = document.getElementById('qtyHuyInput');
    const qtyMatInput = document.getElementById('qtyMatInput');

    const xuLyNoteBox = document.getElementById('xuLyNoteBox');
    const xuLyNoteInput = document.getElementById('xuLyNoteInput');
    const huyNoteBox = document.getElementById('huyNoteBox');
    const huyNoteInput = document.getElementById('huyNoteInput');
    const photoUploadSection = document.getElementById('photoUploadSection');
    const photoFileInput = document.getElementById('photoFileInput');
    const photoPreviewGrid = document.getElementById('photoPreviewGrid');

    const productPhotoFileInput = document.getElementById('productPhotoFileInput');
    const productPhotoPreviewGrid = document.getElementById('productPhotoPreviewGrid');

    // Wage Banner
    const wageCurrentAmount = document.getElementById('wageCurrentAmount');
    const wageDailyAccumulated = document.getElementById('wageDailyAccumulated');

    // Downtime
    const downtimeNoteInput = document.getElementById('downtimeNoteInput');
    const downtimePills = document.querySelectorAll('.pill-btn');
    const timerDisplay = document.getElementById('timerDisplay');
    const btnStartTimer = document.getElementById('btnStartTimer');

    // Submit & Export & User Mgmt
    const btnSubmitLog = document.getElementById('btnSubmitLog');
    const btnExportExcel = document.getElementById('btnExportExcel');
    const userTableTbody = document.getElementById('userTableTbody');
    const newUsernameInput = document.getElementById('newUsernameInput');
    const newFullNameInput = document.getElementById('newFullNameInput');
    const newPasswordInput = document.getElementById('newPasswordInput');
    const newRoleSelect = document.getElementById('newRoleSelect');
    const btnSaveUser = document.getElementById('btnSaveUser');

    // 3. User Authentication & Login Session
    function checkAuthSession() {
        if (!currentUser) {
            loginModal.classList.add('active');
            if (btnOpenChangePass) btnOpenChangePass.style.display = 'none';
        } else {
            loginModal.classList.remove('active');
            if (btnOpenChangePass) btnOpenChangePass.style.display = 'inline-flex';
            currentUserNameLabel.textContent = currentUser.name;
            currentUserRoleTag.textContent = currentUser.role === 'admin' ? 'Admin' : 'Công Nhân';
            currentUserRoleTag.className = currentUser.role === 'admin' ? 'user-tag badge-danger' : 'user-tag badge-success';
            
            if (currentUser.role === 'admin') {
                adminTabBtn.style.display = 'flex';
            } else {
                // If worker logged in, stay on worker tab
                currentRole = 'worker';
                workerTabBtn.classList.add('active');
                adminTabBtn.classList.remove('active');
                workerSection.style.display = 'block';
                adminSection.style.display = 'none';
            }
            updateWageDisplay();
        }
    }

    const loginErrorAlert = document.getElementById('loginErrorAlert');
    const loginCard = document.getElementById('loginCard');

    btnLoginSubmit.addEventListener('click', () => {
        const usernameInput = loginUsernameInput.value.trim().toLowerCase();
        const passwordInput = loginPasswordInput.value.trim();

        if (loginErrorAlert) loginErrorAlert.style.display = 'none';
        loginUsernameInput.classList.remove('shake-error');
        loginPasswordInput.classList.remove('shake-error');
        if (loginCard) loginCard.classList.remove('shake-error');

        if (!usernameInput || !passwordInput) {
            if (loginErrorAlert) {
                loginErrorAlert.querySelector('span:last-child').textContent = 'Vui lòng nhập đầy đủ Tên đăng nhập và Mật khẩu!';
                loginErrorAlert.style.display = 'flex';
            }
            showToast('Vui lòng nhập Tên đăng nhập và Mật khẩu!', 'danger');
            return;
        }

        // Master Accounts Pool (Always fallback to INITIAL_DATA if needed)
        let accounts = (window.AppData && window.AppData.userAccounts && window.AppData.userAccounts.length > 0)
            ? window.AppData.userAccounts
            : (window.INITIAL_DATA ? window.INITIAL_DATA.userAccounts : []);

        if (!accounts || accounts.length === 0) {
            accounts = window.INITIAL_DATA ? window.INITIAL_DATA.userAccounts : [];
        }

        // Flexible lookup: match username, ID (NV01), or Full Name
        const found = accounts.find(u => {
            const matchName = u.name ? u.name.toLowerCase() : '';
            const matchUser = u.username ? u.username.toLowerCase() : '';
            const matchId = u.id ? u.id.toLowerCase() : '';
            
            const isNameMatch = matchName === usernameInput || matchUser === usernameInput || matchId === usernameInput;
            return isNameMatch && u.password === passwordInput;
        });

        if (found) {
            currentUser = found;
            localStorage.setItem('GCCK_CURRENT_USER', JSON.stringify(currentUser));
            if (loginErrorAlert) loginErrorAlert.style.display = 'none';
            showToast(`🎉 Đăng nhập thành công! Chào mừng ${currentUser.name}`, 'success');
            checkAuthSession();
        } else {
            // Trigger Shake Error Effect & Inline Red Banner
            if (loginErrorAlert) {
                loginErrorAlert.querySelector('span:last-child').textContent = '⚠️ Tên đăng nhập hoặc Mật khẩu không chính xác! Vui lòng kiểm tra lại.';
                loginErrorAlert.style.display = 'flex';
            }
            if (loginCard) {
                loginCard.classList.add('shake-error');
                setTimeout(() => loginCard.classList.remove('shake-error'), 500);
            }
            loginPasswordInput.classList.add('shake-error');
            loginPasswordInput.value = '';
            loginPasswordInput.focus();
            showToast('⚠️ Tên đăng nhập hoặc Mật khẩu không chính xác!', 'danger');
        }
    });

    btnLogout.addEventListener('click', () => {
        currentUser = null;
        localStorage.removeItem('GCCK_CURRENT_USER');
        if (loginErrorAlert) loginErrorAlert.style.display = 'none';
        showToast('Đã đăng xuất tài khoản', 'info');
        checkAuthSession();
    });

    // 3.1 Change Password Functionality
    const btnOpenChangePass = document.getElementById('btnOpenChangePass');
    const changePassModal = document.getElementById('changePassModal');
    const btnCloseChangePass = document.getElementById('btnCloseChangePass');
    const oldPasswordInput = document.getElementById('oldPasswordInput');
    const changeNewPasswordInput = document.getElementById('changeNewPasswordInput');
    const confirmNewPasswordInput = document.getElementById('confirmNewPasswordInput');
    const btnSubmitChangePass = document.getElementById('btnSubmitChangePass');
    const changePassAlert = document.getElementById('changePassAlert');
    const changePassAlertMsg = document.getElementById('changePassAlertMsg');

    if (btnOpenChangePass) {
        btnOpenChangePass.addEventListener('click', () => {
            if (!currentUser) return;
            if (changePassAlert) changePassAlert.style.display = 'none';
            if (oldPasswordInput) oldPasswordInput.value = '';
            if (changeNewPasswordInput) changeNewPasswordInput.value = '';
            if (confirmNewPasswordInput) confirmNewPasswordInput.value = '';
            if (changePassModal) changePassModal.classList.add('active');
        });
    }

    if (btnCloseChangePass) {
        btnCloseChangePass.addEventListener('click', () => {
            if (changePassModal) changePassModal.classList.remove('active');
        });
    }

    if (btnSubmitChangePass) {
        btnSubmitChangePass.addEventListener('click', () => {
            if (!currentUser) {
                showToast('Vui lòng đăng nhập trước khi đổi mật khẩu!', 'danger');
                return;
            }

            const oldPass = oldPasswordInput ? oldPasswordInput.value.trim() : '';
            const newPass = changeNewPasswordInput ? changeNewPasswordInput.value.trim() : '';
            const confirmPass = confirmNewPasswordInput ? confirmNewPasswordInput.value.trim() : '';

            if (changePassAlert) changePassAlert.style.display = 'none';

            if (!oldPass || !newPass || !confirmPass) {
                if (changePassAlertMsg && changePassAlert) {
                    changePassAlertMsg.textContent = 'Vui lòng điền đầy đủ Mật khẩu cũ, Mật khẩu mới và Xác nhận!';
                    changePassAlert.style.display = 'flex';
                }
                showToast('Vui lòng điền đầy đủ các thông tin mật khẩu!', 'warning');
                return;
            }

            if (oldPass !== currentUser.password) {
                if (changePassAlertMsg && changePassAlert) {
                    changePassAlertMsg.textContent = 'Mật khẩu hiện tại không chính xác!';
                    changePassAlert.style.display = 'flex';
                }
                showToast('⚠️ Mật khẩu hiện tại không đúng!', 'danger');
                return;
            }

            if (newPass !== confirmPass) {
                if (changePassAlertMsg && changePassAlert) {
                    changePassAlertMsg.textContent = 'Mật khẩu mới và Nhập lại mật khẩu không khớp nhau!';
                    changePassAlert.style.display = 'flex';
                }
                showToast('⚠️ Mật khẩu xác nhận không khớp!', 'danger');
                return;
            }

            // Update user password
            currentUser.password = newPass;
            localStorage.setItem('GCCK_CURRENT_USER', JSON.stringify(currentUser));

            // Update in master userAccounts pool
            if (window.AppData && window.AppData.userAccounts) {
                const acc = window.AppData.userAccounts.find(u => u.username === currentUser.username || u.id === currentUser.id);
                if (acc) {
                    acc.password = newPass;
                }
                localStorage.setItem('GCCK_APP_DATA', JSON.stringify(window.AppData));
            }

            if (changePassModal) changePassModal.classList.remove('active');
            showToast(`🎉 ĐÃ ĐỔI MẬT KHẨU THÀNH CÔNG! Mật khẩu mới của tài khoản ${currentUser.name} đã được cập nhật.`, 'success');
        });
    }

    // 4. Role Switcher (Admin / Worker)
    workerTabBtn.addEventListener('click', () => {
        currentRole = 'worker';
        workerTabBtn.classList.add('active');
        adminTabBtn.classList.remove('active');
        workerSection.style.display = 'block';
        adminSection.style.display = 'none';
        updateWageDisplay();
    });

    adminTabBtn.addEventListener('click', () => {
        if (!currentUser || currentUser.role !== 'admin') {
            showToast('⚠️ Bạn cần đăng nhập tài khoản Admin để vào khu vực Quản trị!', 'danger');
            currentUser = null;
            localStorage.removeItem('GCCK_CURRENT_USER');
            checkAuthSession();
            return;
        }
        currentRole = 'admin';
        adminTabBtn.classList.add('active');
        workerTabBtn.classList.remove('active');
        workerSection.style.display = 'none';
        adminSection.style.display = 'block';
        renderAdminDashboard();
        renderUserAccountsTable();
    });

    // 5. Input Method Switcher (QR vs Tap)
    methodTapBtn.addEventListener('click', () => {
        inputMode = 'tap';
        methodTapBtn.classList.add('active');
        methodQrBtn.classList.remove('active');
        qrBannerBox.style.display = 'none';
        manualFormBox.style.display = 'block';
    });

    methodQrBtn.addEventListener('click', () => {
        inputMode = 'qr';
        methodQrBtn.classList.add('active');
        methodTapBtn.classList.remove('active');
        qrBannerBox.style.display = 'block';
        manualFormBox.style.display = 'block';
    });

    qrBannerBox.addEventListener('click', () => {
        window.QRModule.openScannerModal((scannedData) => {
            handleQRScannedData(scannedData);
        });
    });

    // 6. Cascade Dropdown Population
    function initDropdowns() {
        // Customers
        customerSelect.innerHTML = '<option value="">-- Chọn Khách hàng --</option>';
        window.AppData.customers.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            customerSelect.appendChild(opt);
        });

        // Machines
        machineSelect.innerHTML = '<option value="">-- Chọn Máy gia công --</option>';
        window.AppData.machines.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            machineSelect.appendChild(opt);
        });

        // Materials
        materialSelect.innerHTML = '<option value="">-- Chọn Dao cụ / Vật tư --</option>';
        window.AppData.materials.forEach(mat => {
            const opt = document.createElement('option');
            opt.value = mat.name;
            opt.textContent = `${mat.name} (${mat.unit})`;
            materialSelect.appendChild(opt);
        });

        // Update datalists for Master Data addition form
        updateMasterDataDatalists();
    }

    // Force Sync Data Button Listener
    const btnForceSyncData = document.getElementById('btnForceSyncData');
    if (btnForceSyncData) {
        btnForceSyncData.addEventListener('click', () => {
            if (window.INITIAL_DATA) {
                window.AppData = JSON.parse(JSON.stringify(window.INITIAL_DATA));
                localStorage.setItem('GCCK_APP_DATA', JSON.stringify(window.AppData));
                initDropdowns();
                showToast('🔄 Đã nạp & đồng bộ 100% dữ liệu Sản phẩm & Nguyên công mới nhất!', 'success');
            }
        });
    }

    // Machine & Product Cascade -> Operation Filtering & Touch Pill Buttons
    function populateOperationsForProductAndMachine(ignoreMachineFilter = false) {
        const selectedProduct = productSelect ? productSelect.value : '';
        const selectedMachine = machineSelect ? machineSelect.value : '';
        const customOpBox = document.getElementById('customOperationBox');
        const opContainer = document.getElementById('operationContainer');
        
        if (customOpBox) customOpBox.style.display = 'none';

        operationSelect.innerHTML = '<option value="">-- Chọn Nguyên công --</option>';
        if (opContainer) opContainer.innerHTML = '';
        wipStockBadge.style.display = 'none';

        if (!selectedProduct) {
            if (opContainer) opContainer.innerHTML = '<p style="font-size: 12px; color: #94a3b8; grid-column: 1/-1; margin: 4px 0;">(Vui lòng chọn Khách hàng & Sản phẩm ở trên trước)</p>';
            return;
        }

        const targetClean = window.cleanKey(selectedProduct);
        let ops = [];

        if (window.AppData && window.AppData.operationsByProduct) {
            // Find all matching keys (exact or cleanKey) and merge their operations so no NC is lost
            Object.keys(window.AppData.operationsByProduct).forEach(k => {
                if (window.cleanKey(k) === targetClean) {
                    const rawList = window.AppData.operationsByProduct[k];
                    if (Array.isArray(rawList)) {
                        rawList.forEach(item => {
                            const opName = typeof item === 'string' ? item : (item ? item.op : '');
                            const opTime = typeof item === 'object' && item.time_s ? item.time_s : 1800;
                            const opClean = window.cleanKey(opName);
                            if (opName && !ops.some(o => window.cleanKey(o.op) === opClean)) {
                                ops.push({ op: opName, time_s: opTime });
                            }
                        });
                    }
                }
            });
        }

        if (!ops || ops.length === 0) {
            ops = [
                { op: "NC1: Tiện thô phay mặt", time_s: 2700 },
                { op: "NC2: Phay CNC rãnh", time_s: 3600 },
                { op: "NC3: Khoan 8 lỗ tâm", time_s: 1800 },
                { op: "NC4: Mài hoàn thiện", time_s: 2400 },
                { op: "NC5: Doạ lỗ tinh", time_s: 1800 },
                { op: "NC6: Cắt rãnh kẹp", time_s: 2100 },
                { op: "NC7: Vát mép góc R", time_s: 1500 },
                { op: "NC8: Tiện tinh ren", time_s: 2700 },
                { op: "NC9: Mài mặt đầu", time_s: 1800 },
                { op: "NC10: Đột dấu kiểm tra", time_s: 1200 }
            ];
        }

        // Sort machine-relevant operations to the top without hiding non-matching operations
        let sortedOps = [...ops];
        if (selectedMachine && !ignoreMachineFilter) {
            const m = selectedMachine.toLowerCase();
            sortedOps.sort((a, b) => {
                const aName = (a.op || '').toLowerCase();
                const bName = (b.op || '').toLowerCase();
                let aMatch = false;
                let bMatch = false;
                if (m.includes('tiện')) {
                    aMatch = aName.includes('tiện') || aName.includes('cưa') || aName.includes('thô') || aName.includes('hoàn thiện');
                    bMatch = bName.includes('tiện') || bName.includes('cưa') || bName.includes('thô') || bName.includes('hoàn thiện');
                } else if (m.includes('phay')) {
                    aMatch = aName.includes('phay') || aName.includes('khoan') || aName.includes('rãnh') || aName.includes('mp');
                    bMatch = bName.includes('phay') || bName.includes('khoan') || bName.includes('rãnh') || bName.includes('mp');
                } else if (m.includes('mài')) {
                    aMatch = aName.includes('mài') || aName.includes('mặt') || aName.includes('phẳng');
                    bMatch = bName.includes('mài') || bName.includes('mặt') || bName.includes('phẳng');
                } else if (m.includes('cắt dây') || m.includes('podatech')) {
                    aMatch = aName.includes('cắt') || aName.includes('dây');
                    bMatch = bName.includes('cắt') || bName.includes('dây');
                }
                return (bMatch ? 1 : 0) - (aMatch ? 1 : 0);
            });
        }

        // 1. Populate Dropdown Select
        sortedOps.forEach(opItem => {
            const opt = document.createElement('option');
            opt.value = opItem.op;
            opt.textContent = `${opItem.op} (${opItem.time_s}s)`;
            operationSelect.appendChild(opt);
        });

        // Add option for manual custom NC entry in dropdown
        const optCustom = document.createElement('option');
        optCustom.value = '__CUSTOM_OP__';
        optCustom.textContent = '✏️ + Thêm / Nhập Nguyên Công Mới (Thủ công)...';
        optCustom.style.fontWeight = 'bold';
        optCustom.style.color = '#34d399';
        operationSelect.appendChild(optCustom);

        // 2. Populate Touch Pill Buttons Container (#operationContainer)
        if (opContainer) {
            sortedOps.forEach(opItem => {
                const btn = document.createElement('div');
                btn.className = 'pill-btn';
                btn.style.padding = '10px 8px';
                btn.style.fontSize = '12.5px';
                btn.style.lineHeight = '1.3';
                btn.style.display = 'flex';
                btn.style.alignItems = 'center';
                btn.style.justifyContent = 'center';
                btn.style.minHeight = '44px';
                btn.textContent = opItem.op;
                btn.setAttribute('data-op', opItem.op);

                btn.addEventListener('click', function() {
                    opContainer.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    operationSelect.value = opItem.op;
                    operationSelect.dispatchEvent(new Event('change'));
                });

                opContainer.appendChild(btn);
            });

            // Add visual pill button for custom NC entry
            const btnCustomPill = document.createElement('div');
            btnCustomPill.className = 'pill-btn';
            btnCustomPill.style.borderColor = 'rgba(52, 211, 153, 0.5)';
            btnCustomPill.style.color = '#34d399';
            btnCustomPill.style.padding = '10px 8px';
            btnCustomPill.style.fontSize = '12px';
            btnCustomPill.style.minHeight = '44px';
            btnCustomPill.style.display = 'flex';
            btnCustomPill.style.alignItems = 'center';
            btnCustomPill.style.justifyContent = 'center';
            btnCustomPill.textContent = '✏️ + Nhập NC Mới';
            btnCustomPill.setAttribute('data-op', '__CUSTOM_OP__');

            btnCustomPill.addEventListener('click', function() {
                opContainer.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                operationSelect.value = '__CUSTOM_OP__';
                operationSelect.dispatchEvent(new Event('change'));
            });
            opContainer.appendChild(btnCustomPill);
        }

        updateWageDisplay();
    }

    // Customer -> Product Cascade
    customerSelect.addEventListener('change', (e) => {
        const selectedCustomer = e.target.value;
        const opContainer = document.getElementById('operationContainer');
        productSelect.innerHTML = '<option value="">-- Chọn Sản phẩm --</option>';
        operationSelect.innerHTML = '<option value="">-- Chọn Nguyên công --</option>';
        if (opContainer) opContainer.innerHTML = '<p style="font-size: 12px; color: #94a3b8; grid-column: 1/-1; margin: 4px 0;">(Vui lòng chọn Sản phẩm trước)</p>';
        wipStockBadge.style.display = 'none';

        if (selectedCustomer) {
            const targetClean = window.cleanKey(selectedCustomer);
            let prods = null;
            const foundKey = Object.keys(window.AppData.productsByCustomer).find(k => window.cleanKey(k) === targetClean);
            if (foundKey) prods = window.AppData.productsByCustomer[foundKey];

            if (prods && Array.isArray(prods)) {
                prods.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p;
                    opt.textContent = p;
                    productSelect.appendChild(opt);
                });
            }
        }
    });

    // Product & Machine -> Operation Cascade Listener
    productSelect.addEventListener('change', () => {
        populateOperationsForProductAndMachine();
    });

    machineSelect.addEventListener('change', () => {
        populateOperationsForProductAndMachine();
    });

    operationSelect.addEventListener('change', () => {
        const prod = productSelect.value;
        const op = operationSelect.value;
        const customOpBox = document.getElementById('customOperationBox');
        const customOpInput = document.getElementById('customOperationInput');
        const opContainer = document.getElementById('operationContainer');

        if (op === '__SHOW_ALL__') {
            populateOperationsForProductAndMachine(true);
            return;
        }

        if (op === '__CUSTOM_OP__') {
            if (customOpBox) customOpBox.style.display = 'block';
            if (customOpInput) customOpInput.focus();
        } else {
            if (customOpBox) customOpBox.style.display = 'none';
        }

        // Sync active state in touch pill buttons (#operationContainer)
        if (opContainer) {
            const pills = opContainer.querySelectorAll('.pill-btn');
            pills.forEach(p => {
                const pOp = p.getAttribute('data-op');
                if (pOp === op) {
                    p.classList.add('active');
                } else {
                    p.classList.remove('active');
                }
            });
        }

        // Auto-select Machine if default machine is defined for this operation
        if (prod && op && op !== '__CUSTOM_OP__' && op !== '__SHOW_ALL__') {
            const canonicalProd = window.getCanonicalProductKey(prod);
            const opsArr = window.AppData.operationsByProduct ? window.AppData.operationsByProduct[canonicalProd] : null;
            if (opsArr && Array.isArray(opsArr)) {
                const foundOpObj = opsArr.find(o => (typeof o === 'object' && o ? o.op : o) === op);
                if (foundOpObj && typeof foundOpObj === 'object' && foundOpObj.machine) {
                    const targetMachine = foundOpObj.machine;
                    // Check if machine exists in select, if not add it
                    let matchOpt = Array.from(machineSelect.options).find(opt => opt.value === targetMachine || window.cleanKey(opt.value) === window.cleanKey(targetMachine));
                    if (!matchOpt && targetMachine) {
                        matchOpt = document.createElement('option');
                        matchOpt.value = targetMachine;
                        matchOpt.textContent = targetMachine;
                        machineSelect.appendChild(matchOpt);
                    }
                    if (matchOpt) {
                        machineSelect.value = matchOpt.value;
                    }
                }
            }

            const availableWip = Math.floor(10 + Math.random() * 40);
            wipStockCount.textContent = availableWip;
            wipStockBadge.style.display = 'inline-flex';
        } else {
            wipStockBadge.style.display = 'none';
        }
        updateWageDisplay();
    });

    // Material Unit & Tool Life Warning
    materialSelect.addEventListener('change', (e) => {
        const matName = e.target.value;
        const mat = window.AppData.materials.find(m => m.name === matName);
        if (mat) {
            materialUnitLabel.textContent = mat.unit;
            if (matName.includes('Chíp') || matName.includes('Chip')) {
                toolWearAlert.style.display = 'flex';
            } else {
                toolWearAlert.style.display = 'none';
            }
        } else {
            materialUnitLabel.textContent = 'ĐVT';
            toolWearAlert.style.display = 'none';
        }
    });

    // 7. Dynamic Piece Rate Wage Calculation
    function updateWageDisplay() {
        const product = productSelect ? productSelect.value : '';
        const op = operationSelect ? operationSelect.value : '';
        const qtyDat = parseInt(qtyDatInput ? qtyDatInput.value : 1) || 0;

        let unitWage = 45000;
        if (product && op && window.AppData.operationWages) {
            const key = `${product}___${op}`;
            const canonicalP = window.getCanonicalProductKey(product);
            const canonicalKey = `${canonicalP}___${op}`;

            if (window.AppData.operationWages[key]) {
                unitWage = window.AppData.operationWages[key];
            } else if (window.AppData.operationWages[canonicalKey]) {
                unitWage = window.AppData.operationWages[canonicalKey];
            }
        }

        const currentTurnWage = qtyDat * unitWage;
        if (wageCurrentAmount) {
            wageCurrentAmount.textContent = `${currentTurnWage.toLocaleString()} VNĐ`;
        }

        const workerName = currentUser ? currentUser.name : 'Hoàng Ngọc Hà';
        let dailyTotal = 0;
        if (window.AppData.historyLogs) {
            window.AppData.historyLogs.forEach(log => {
                if (log.worker === workerName) {
                    const rate = log.piece_wage_rate || 45000;
                    dailyTotal += (log.qty_dat || 0) * rate;
                }
            });
        }
        if (wageDailyAccumulated) {
            wageDailyAccumulated.textContent = `${(dailyTotal + currentTurnWage).toLocaleString()} VNĐ`;
        }
    }

    // Quantity Buttons (+ / -)
    window.adjustQty = function(id, delta) {
        const input = document.getElementById(id);
        let val = parseInt(input.value) || 0;
        val += delta;
        if (val < 0) val = 0;
        input.value = val;

        const qtyXuLy = parseInt(qtyXuLyInput.value) || 0;
        const qtyHuy = parseInt(qtyHuyInput.value) || 0;

        xuLyNoteBox.style.display = qtyXuLy > 0 ? 'block' : 'none';
        huyNoteBox.style.display = qtyHuy > 0 ? 'block' : 'none';
        
        if (qtyXuLy > 0 || qtyHuy > 0) {
            photoUploadSection.style.display = 'block';
        } else {
            photoUploadSection.style.display = 'none';
        }

        updateWageDisplay();
    };

    // Helper Function: Compress high-res mobile camera photos before upload
    function compressImage(base64Str, maxWidth = 1024, quality = 0.7, callback) {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
            callback(compressedBase64);
        };
        img.onerror = () => callback(base64Str);
    }

    // 8. Photo Camera Attachment Handling (Defect / Scrap & Product Photos)
    if (productPhotoFileInput) {
        productPhotoFileInput.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files && files[0]) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const imgData = event.target.result;
                    compressImage(imgData, 1024, 0.75, (compressedData) => {
                        attachedProductPhotos.push(compressedData);
                        
                        const img = document.createElement('img');
                        img.src = compressedData;
                        img.className = 'photo-thumb';
                        img.style.border = '2px solid #34d399';
                        if (productPhotoPreviewGrid) productPhotoPreviewGrid.appendChild(img);
                        
                        showToast('📦 Đã chụp & đính kèm ảnh sản phẩm thành công!', 'success');
                    });
                };
                reader.readAsDataURL(files[0]);
            }
        });
    }

    if (photoFileInput) {
        photoFileInput.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files && files[0]) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const imgData = event.target.result;
                    compressImage(imgData, 1024, 0.75, (compressedData) => {
                        attachedPhotos.push(compressedData);
                        
                        const img = document.createElement('img');
                        img.src = compressedData;
                        img.className = 'photo-thumb';
                        if (photoPreviewGrid) photoPreviewGrid.appendChild(img);
                        
                        showToast('📷 Đã chụp & tối ưu hóa ảnh phế phẩm thành công!', 'success');
                    });
                };
                reader.readAsDataURL(files[0]);
            }
        });
    }

    // 9. Downtime Pills & Timer
    downtimePills.forEach(pill => {
        pill.addEventListener('click', () => {
            downtimePills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
        });
    });

    btnStartTimer.addEventListener('click', () => {
        if (!isTimerRunning) {
            isTimerRunning = true;
            btnStartTimer.textContent = 'DỪNG TIMER';
            btnStartTimer.className = 'btn-timer stop';
            timerInterval = setInterval(() => {
                timerSeconds++;
                const mins = Math.floor(timerSeconds / 60);
                const secs = timerSeconds % 60;
                timerDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }, 1000);
        } else {
            isTimerRunning = false;
            clearInterval(timerInterval);
            btnStartTimer.textContent = 'BẮT ĐẦU TIMER';
            btnStartTimer.className = 'btn-timer start';
            showToast(`Đã dừng bấm giờ: ${Math.round(timerSeconds / 60)} phút`, 'warning');
        }
    });

    // 10. Handle QR Code Scanned
    window.handleQRScannedData = function(dataStr) {
        window.QRModule.closeScannerModal();
        try {
            const parts = dataStr.split('|');
            if (parts.length >= 2) {
                const customer = parts[0];
                const product = parts[1];
                const po = parts[2] || '';
                const op = parts[3] || '';

                if (window.AppData.customers.includes(customer)) {
                    customerSelect.value = customer;
                    customerSelect.dispatchEvent(new Event('change'));
                    
                    setTimeout(() => {
                        productSelect.value = product;
                        productSelect.dispatchEvent(new Event('change'));
                        
                        if (op) {
                            setTimeout(() => {
                                operationSelect.value = op;
                                updateWageDisplay();
                            }, 100);
                        }
                    }, 100);

                    showToast(`Quét QR thành công: ${product} (${customer})`, 'success');
                } else {
                    showToast(`Đã quét dữ liệu: ${dataStr}`, 'info');
                }
            } else {
                showToast(`Quét mã QR thành công!`, 'success');
            }
        } catch (e) {
            showToast(`Mã QR không hợp lệ`, 'danger');
        }
    };

    // 11. Submit Production Log
    btnSubmitLog.addEventListener('click', () => {
        if (!currentUser) {
            showToast('⚠️ Vui lòng đăng nhập trước khi báo sản lượng!', 'danger');
            loginModal.classList.add('active');
            return;
        }

        const customer = customerSelect.value;
        const product = productSelect.value;
        const selectedOpVal = operationSelect.value;
        const customOpInput = document.getElementById('customOperationInput');
        let op = selectedOpVal;

        if (selectedOpVal === '__CUSTOM_OP__') {
            op = customOpInput ? customOpInput.value.trim() : '';
            if (!op) {
                showToast('Vui lòng nhập tên Nguyên công bổ sung thủ công!', 'danger');
                if (customOpInput) customOpInput.focus();
                return;
            }
            // Permanently save custom operation to product so it becomes selectable for everyone
            const canonicalP = window.getCanonicalProductKey(product);
            if (!window.AppData.operationsByProduct) window.AppData.operationsByProduct = {};
            if (!window.AppData.operationsByProduct[canonicalP]) {
                window.AppData.operationsByProduct[canonicalP] = [];
            }
            if (!window.AppData.operationsByProduct[canonicalP].some(o => (typeof o === 'string' ? o : o.op) === op)) {
                window.AppData.operationsByProduct[canonicalP].push({ op: op, time_s: 2700 });
            }
            if (!window.AppData.operationWages) window.AppData.operationWages = {};
            window.AppData.operationWages[`${canonicalP}___${op}`] = 45000;
            localStorage.setItem('GCCK_APP_DATA', JSON.stringify(window.AppData));
        } else if (selectedOpVal === '__SHOW_ALL__' || !selectedOpVal) {
            showToast('Vui lòng chọn một Nguyên công cụ thể hoặc chọn Nhập thủ công!', 'danger');
            return;
        }
        const machine = machineSelect.value;
        const qtyDat = parseInt(qtyDatInput.value) || 0;
        const qtyXuLy = parseInt(qtyXuLyInput.value) || 0;
        const qtyHuy = parseInt(qtyHuyInput.value) || 0;
        const material = materialSelect.value;
        const qtyMat = parseInt(qtyMatInput.value) || 0;

        let activePill = document.querySelector('.pill-btn.active');
        let downtimeMin = activePill ? parseInt(activePill.getAttribute('data-min')) : 0;
        if (timerSeconds > 0) {
            downtimeMin = Math.round(timerSeconds / 60);
        }

        // Validation
        if (!customer || !product || !op) {
            showToast('Vui lòng chọn đầy đủ Khách hàng, Sản phẩm và Nguyên công!', 'danger');
            return;
        }

        if (qtyDat === 0 && qtyXuLy === 0 && qtyHuy === 0) {
            showToast('Vui lòng nhập ít nhất số lượng Đạt, Xử lý hoặc Hủy!', 'danger');
            return;
        }

        let unitWage = 45000;
        const key = `${product}___${op}`;
        if (window.AppData.operationWages && window.AppData.operationWages[key]) {
            unitWage = window.AppData.operationWages[key];
        }
        const totalPieceWage = qtyDat * unitWage;

        const reportDate = (reportDateInput && reportDateInput.value) ? reportDateInput.value : getTodayDateString();

        const newLog = {
            id: Date.now(),
            worker: currentUser.name,
            worker_id: currentUser.id,
            customer: customer,
            product: product,
            po: 'PO-' + Math.floor(1000 + Math.random() * 9000),
            date: reportDate,
            op: op,
            qty_dat: qtyDat,
            qty_xuly: qtyXuLy,
            qty_huy: qtyHuy,
            piece_wage_rate: unitWage,
            total_wage: totalPieceWage,
            xuly_note: xuLyNoteInput.value,
            huy_note: huyNoteInput.value,
            product_photos: [...attachedProductPhotos],
            photos: [...attachedPhotos],
            machine: machine || 'Máy tiện CNC1',
            material: material || 'Không tiêu hao',
            qty_material: qtyMat,
            downtime_min: downtimeMin,
            downtime_note: downtimeNoteInput.value || 'Bình thường'
        };

        // Google Sheets Integration URL Sync (Hardcoded URL cố định cho mọi thiết bị)
        const googleScriptUrl = localStorage.getItem('GOOGLE_SCRIPT_URL') 
            || (window.AppData && window.AppData.googleScriptUrl) 
            || (window.INITIAL_DATA && window.INITIAL_DATA.googleScriptUrl) 
            || DEFAULT_GOOGLE_SCRIPT_URL;

        if (googleScriptUrl) {
            // Gửi dữ liệu kèm ảnh nén để Google Apps Script tự động tải lên Google Drive & gắn link vào Sheet
            const sheetPayload = {
                ...newLog,
                product_photos: [...attachedProductPhotos],
                photos: [...attachedPhotos]
            };

            try {
                fetch(googleScriptUrl, {
                    method: 'POST',
                    mode: 'no-cors',
                    cache: 'no-cache',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(sheetPayload)
                }).then(() => {
                    console.log('Đã gửi dữ liệu và tải ảnh lên Google Drive thành công!');
                }).catch(err => console.log('Lỗi gửi Google Sheets trên điện thoại:', err));
            } catch (e) {
                console.log('Google Sheets Sync exception:', e);
            }
        }

        window.AppData.historyLogs.unshift(newLog);
        localStorage.setItem('GCCK_APP_DATA', JSON.stringify(window.AppData));

        showToast(`🚀 GHI NHẬN THÀNH CÔNG! (+${totalPieceWage.toLocaleString()} VNĐ Lương khoán cho ${currentUser.name})`, 'success');

        // Reset toàn bộ Form về trạng thái ban đầu sẵn sàng nhập mới
        resetReportForm();
    });

    // Hàm Reset Form báo cáo sản lượng
    function resetReportForm() {
        if (customerSelect) customerSelect.value = '';
        if (productSelect) {
            productSelect.value = '';
            productSelect.innerHTML = '<option value="">-- Chọn Sản phẩm (Vui lòng chọn KH trước) --</option>';
        }
        if (machineSelect) machineSelect.value = '';
        if (operationSelect) {
            operationSelect.value = '';
            operationSelect.innerHTML = '<option value="">-- Chọn Nguyên công (Vui lòng chọn SP & Máy trước) --</option>';
        }
        const customOpBox = document.getElementById('customOperationBox');
        const customOpInput = document.getElementById('customOperationInput');
        if (customOpBox) customOpBox.style.display = 'none';
        if (customOpInput) customOpInput.value = '';
        if (materialSelect) materialSelect.value = '';
        if (materialUnitLabel) materialUnitLabel.textContent = 'Cạnh';
        if (wipStockBadge) wipStockBadge.style.display = 'none';
        if (toolWearAlert) toolWearAlert.style.display = 'none';

        if (reportDateInput) reportDateInput.value = getTodayDateString();
        if (qtyDatInput) qtyDatInput.value = 1;
        if (qtyXuLyInput) qtyXuLyInput.value = 0;
        if (qtyHuyInput) qtyHuyInput.value = 0;
        if (qtyMatInput) qtyMatInput.value = 0;

        if (xuLyNoteInput) xuLyNoteInput.value = '';
        if (huyNoteInput) huyNoteInput.value = '';
        if (downtimeNoteInput) downtimeNoteInput.value = '';

        if (xuLyNoteBox) xuLyNoteBox.style.display = 'none';
        if (huyNoteBox) huyNoteBox.style.display = 'none';
        if (photoUploadSection) photoUploadSection.style.display = 'none';

        attachedPhotos = [];
        attachedProductPhotos = [];
        if (photoPreviewGrid) photoPreviewGrid.innerHTML = '';
        if (productPhotoPreviewGrid) productPhotoPreviewGrid.innerHTML = '';
        if (photoFileInput) photoFileInput.value = '';
        if (productPhotoFileInput) productPhotoFileInput.value = '';

        if (downtimePills) downtimePills.forEach(p => p.classList.remove('active'));
        if (isTimerRunning) {
            isTimerRunning = false;
            if (timerInterval) clearInterval(timerInterval);
            if (btnStartTimer) {
                btnStartTimer.textContent = 'BẮT ĐẦU TIMER';
                btnStartTimer.className = 'btn-timer start';
            }
        }
        timerSeconds = 0;
        if (timerDisplay) timerDisplay.textContent = '00:00';

        updateWageDisplay();
    }

    // 12. User Accounts Management (Admin Only)
    function renderUserAccountsTable() {
        if (!userTableTbody) return;
        userTableTbody.innerHTML = '';
        const accounts = window.AppData.userAccounts || [];

        accounts.forEach((u, idx) => {
            const tr = document.createElement('tr');
            const roleBadge = u.role === 'admin' ? '<span class="badge badge-danger">Admin</span>' : '<span class="badge badge-success">Worker</span>';
            tr.innerHTML = `
                <td><strong>${u.id || ('NV' + idx)}</strong></td>
                <td><code>${u.username}</code></td>
                <td>${u.name}</td>
                <td>${roleBadge}</td>
                <td><code>${u.password}</code></td>
                <td>
                    <button class="pill-btn" onclick="editUserAccount('${u.username}')" style="padding:4px 8px; font-size:11px;">Sửa</button>
                </td>
            `;
            userTableTbody.appendChild(tr);
        });
    }

    if (btnSaveUser) {
        btnSaveUser.addEventListener('click', () => {
            const username = newUsernameInput.value.trim().toLowerCase();
            const fullName = newFullNameInput.value.trim();
            const password = newPasswordInput.value.trim();
            const role = newRoleSelect.value;

            if (!username || !fullName || !password) {
                showToast('Vui lòng nhập đầy đủ Tên đăng nhập, Họ tên và Mật khẩu!', 'danger');
                return;
            }

            const accounts = window.AppData.userAccounts || [];
            const existingIdx = accounts.findIndex(u => u.username.toLowerCase() === username);

            if (existingIdx >= 0) {
                accounts[existingIdx].name = fullName;
                accounts[existingIdx].password = password;
                accounts[existingIdx].role = role;
                showToast(`Đã cập nhật mật khẩu cho tài khoản: ${username}`, 'success');
            } else {
                accounts.push({
                    id: f`NV${accounts.length + 1}`,
                    username: username,
                    name: fullName,
                    role: role,
                    password: password,
                    dept: 'Tổ GCCK'
                });
                showToast(`Đã tạo tài khoản mới: ${username}`, 'success');
            }

            window.AppData.userAccounts = accounts;
            localStorage.setItem('GCCK_APP_DATA', JSON.stringify(window.AppData));

            newUsernameInput.value = '';
            newFullNameInput.value = '';
            newPasswordInput.value = '';
            renderUserAccountsTable();
        });
    }

    // Helper: Update datalists for Master Data customer, product & operations suggestions
    function updateMasterDataDatalists() {
        const masterCustomerList = document.getElementById('masterCustomerList');
        const masterProductList = document.getElementById('masterProductList');
        const masterOpNameList = document.getElementById('masterOpNameList');
        const masterCustomerInput = document.getElementById('masterCustomerInput');

        if (masterCustomerList && window.AppData && window.AppData.customers) {
            masterCustomerList.innerHTML = '';
            window.AppData.customers.forEach(cust => {
                const opt = document.createElement('option');
                opt.value = cust;
                masterCustomerList.appendChild(opt);
            });
        }

        if (masterProductList && window.AppData && window.AppData.productsByCustomer) {
            masterProductList.innerHTML = '';
            const selectedCust = masterCustomerInput ? masterCustomerInput.value.trim() : '';
            let productList = [];
            if (selectedCust && window.AppData.productsByCustomer[selectedCust]) {
                productList = window.AppData.productsByCustomer[selectedCust];
            } else {
                Object.values(window.AppData.productsByCustomer).forEach(arr => {
                    if (Array.isArray(arr)) {
                        arr.forEach(p => { if (!productList.includes(p)) productList.push(p); });
                    }
                });
            }
            productList.forEach(prod => {
                const opt = document.createElement('option');
                opt.value = prod;
                masterProductList.appendChild(opt);
            });
        }

        if (masterOpNameList) {
            masterOpNameList.innerHTML = '';
            const uniqueOps = new Set([
                "NC1: Tiện thô phay mặt",
                "NC2: Phay CNC rãnh",
                "NC3: Khoan 8 lỗ tâm",
                "NC4: Mài hoàn thiện",
                "NC5: Kiểm tra QA & Đóng gói",
                "G/c Cắt cưa phôi",
                "G/c Tiện thô",
                "G/c Tiện tinh",
                "G/c Phay CNC",
                "G/c Khoan / Ta-rô",
                "G/c Mài phẳng",
                "G/c Mài tròn",
                "G/c Cắt dây EDM",
                "G/c Vạt góc / Mài bavia",
                "Nhiệt luyện / Xi mạ"
            ]);

            if (window.AppData && window.AppData.operationsByProduct) {
                Object.values(window.AppData.operationsByProduct).forEach(opsArray => {
                    if (Array.isArray(opsArray)) {
                        opsArray.forEach(o => {
                            if (o && o.op) uniqueOps.add(o.op);
                        });
                    }
                });
            }

            uniqueOps.forEach(opName => {
                const opt = document.createElement('option');
                opt.value = opName;
                masterOpNameList.appendChild(opt);
            });
        }
    }

    // 13. Master Data Dynamic Updates (Add New Product / Multi Operations & Excel Import)
    const masterCustomerInput = document.getElementById('masterCustomerInput');
    const masterProductInput = document.getElementById('masterProductInput');
    const masterMultiOpsInput = document.getElementById('masterMultiOpsInput');
    const btnSaveMasterItem = document.getElementById('btnSaveMasterItem');

    const masterExcelFileInput = document.getElementById('masterExcelFileInput');
    const btnImportMasterExcel = document.getElementById('btnImportMasterExcel');

    // Filter Product datalist when Customer changes
    if (masterCustomerInput) {
        masterCustomerInput.addEventListener('input', () => updateMasterDataDatalists());
        masterCustomerInput.addEventListener('change', () => updateMasterDataDatalists());
    }

    // Quick Suggestions & Fast Operation Line Builder Listeners
    const quickPresetChips = document.getElementById('quickPresetChips');
    const btnInsertSampleCluster = document.getElementById('btnInsertSampleCluster');
    const btnClearMultiOps = document.getElementById('btnClearMultiOps');
    const btnAddQuickOpLine = document.getElementById('btnAddQuickOpLine');
    const quickOpNameInput = document.getElementById('quickOpNameInput');
    const quickOpTimeInput = document.getElementById('quickOpTimeInput');
    const quickOpWageInput = document.getElementById('quickOpWageInput');

    function appendOpLineToMultiInput(lineText) {
        if (!masterMultiOpsInput) return;
        const currentVal = masterMultiOpsInput.value;
        if (!currentVal.trim()) {
            masterMultiOpsInput.value = lineText;
        } else {
            const endsWithNewline = currentVal.endsWith('\n');
            masterMultiOpsInput.value = currentVal + (endsWithNewline ? '' : '\n') + lineText;
        }
    }

    if (quickPresetChips) {
        quickPresetChips.addEventListener('click', (e) => {
            const chip = e.target.closest('.preset-chip[data-template]');
            if (chip) {
                const tmpl = chip.getAttribute('data-template');
                if (tmpl) appendOpLineToMultiInput(tmpl);
            }
        });
    }

    if (btnInsertSampleCluster) {
        btnInsertSampleCluster.addEventListener('click', () => {
            const sampleCluster = 
`NC1: Tiện thô phay mặt | 2700 | 35000
NC2: Phay CNC rãnh | 3600 | 45000
NC3: Khoan 8 lỗ tâm | 1800 | 25000
NC4: Mài hoàn thiện | 2400 | 30000`;
            if (masterMultiOpsInput) {
                if (!masterMultiOpsInput.value.trim()) {
                    masterMultiOpsInput.value = sampleCluster;
                } else {
                    appendOpLineToMultiInput(sampleCluster);
                }
            }
        });
    }

    const btnInsertSampleCluster10 = document.getElementById('btnInsertSampleCluster10');
    if (btnInsertSampleCluster10) {
        btnInsertSampleCluster10.addEventListener('click', () => {
            const sampleCluster10 = 
`NC1: Tiện thô phay mặt | 2700 | 35000
NC2: Phay CNC rãnh | 3600 | 45000
NC3: Khoan 8 lỗ tâm | 1800 | 25000
NC4: Mài hoàn thiện | 2400 | 30000
NC5: Doạ lỗ tinh | 1800 | 25000
NC6: Cắt rãnh kẹp | 2100 | 28000
NC7: Vát mép góc R | 1500 | 20000
NC8: Tiện tinh ren | 2700 | 35000
NC9: Mài mặt đầu | 1800 | 25000
NC10: Đột dấu kiểm tra | 1200 | 18000`;
            if (masterMultiOpsInput) {
                if (!masterMultiOpsInput.value.trim()) {
                    masterMultiOpsInput.value = sampleCluster10;
                } else {
                    appendOpLineToMultiInput(sampleCluster10);
                }
            }
        });
    }

    if (btnClearMultiOps && masterMultiOpsInput) {
        btnClearMultiOps.addEventListener('click', () => {
            masterMultiOpsInput.value = '';
        });
    }

    if (btnAddQuickOpLine) {
        btnAddQuickOpLine.addEventListener('click', () => {
            const opName = quickOpNameInput ? quickOpNameInput.value.trim() : '';
            const timeSec = quickOpTimeInput ? (parseInt(quickOpTimeInput.value) || 2700) : 2700;
            const wage = quickOpWageInput ? (parseInt(quickOpWageInput.value) || 35000) : 35000;

            if (!opName) {
                showToast('Vui lòng chọn hoặc nhập Tên Nguyên Công!', 'warning');
                if (quickOpNameInput) quickOpNameInput.focus();
                return;
            }

            const lineFormatted = `${opName} | ${timeSec} | ${wage}`;
            appendOpLineToMultiInput(lineFormatted);

            if (quickOpNameInput) quickOpNameInput.value = '';
        });
    }

    if (btnSaveMasterItem) {
        btnSaveMasterItem.addEventListener('click', () => {
            const customer = masterCustomerInput ? masterCustomerInput.value.trim() : '';
            const product = masterProductInput ? masterProductInput.value.trim() : '';
            const multiOpsText = masterMultiOpsInput ? masterMultiOpsInput.value.trim() : '';

            if (!customer || !product || !multiOpsText) {
                showToast('Vui lòng nhập Tên Khách hàng, Sản phẩm và Danh sách Nguyên công!', 'danger');
                return;
            }

            const canonicalCust = window.getCanonicalCustomerKey(customer);
            const canonicalProd = window.getCanonicalProductKey(product);

            // Update Customers list
            if (!window.AppData.customers.includes(canonicalCust)) {
                window.AppData.customers.push(canonicalCust);
            }

            // Update Products by Customer
            if (!window.AppData.productsByCustomer) window.AppData.productsByCustomer = {};
            if (!window.AppData.productsByCustomer[canonicalCust]) {
                window.AppData.productsByCustomer[canonicalCust] = [];
            }
            if (!window.AppData.productsByCustomer[canonicalCust].includes(canonicalProd)) {
                window.AppData.productsByCustomer[canonicalCust].push(canonicalProd);
            }

            if (!window.AppData.operationsByProduct) window.AppData.operationsByProduct = {};
            if (!window.AppData.operationsByProduct[canonicalProd]) {
                window.AppData.operationsByProduct[canonicalProd] = [];
            }
            if (!window.AppData.operationWages) window.AppData.operationWages = {};

            // Parse multiline string
            const lines = multiOpsText.split('\n');
            let addedCount = 0;

            lines.forEach(line => {
                const trimmed = line.trim();
                if (trimmed) {
                    const parts = trimmed.split('|');
                    const opName = parts[0].trim();
                    const timeSec = parts[1] ? (parseFloat(parts[1].trim()) || 1800) : 1800;
                    const wageRate = parts[2] ? (parseFloat(parts[2].trim()) || 45000) : 45000;

                    const targetArr = window.AppData.operationsByProduct[canonicalProd];
                    const existingOp = targetArr.find(o => (typeof o === 'string' ? o : o.op) === opName);
                    if (!existingOp) {
                        targetArr.push({ op: opName, time_s: timeSec });
                    } else if (typeof existingOp === 'object') {
                        existingOp.time_s = timeSec;
                    }

                    window.AppData.operationWages[`${canonicalProd}___${opName}`] = wageRate;
                    window.AppData.operationWages[`${product}___${opName}`] = wageRate;
                    addedCount++;
                }
            });

            localStorage.setItem('GCCK_APP_DATA', JSON.stringify(window.AppData));
            initDropdowns();
            pushMasterDataToCloud();

            showToast(`⚙️ Đã lưu thành công Cụm ${addedCount} Nguyên công cho Sản phẩm "${canonicalProd}"!`, 'success');
            if (masterProductInput) masterProductInput.value = '';
            if (masterMultiOpsInput) masterMultiOpsInput.value = '';
        });
    }

    const btnDownloadTemplate = document.getElementById('btnDownloadTemplate');

    if (btnDownloadTemplate) {
        btnDownloadTemplate.addEventListener('click', () => {
            const templateData = [
                {
                    "Khách Hàng (*)": "Win-Win",
                    "Tên Sản Phẩm (*)": "Trục Khuỷu Động Cơ Φ250",
                    "Tên Nguyên Công (*)": "NC1: Tiện thô phay mặt",
                    "Định Mức (Giây/s)": 2700,
                    "Lương Khoán (VNĐ)": 35000,
                    "Máy Gia Công Default": "Máy tiện CNC1",
                    "Ghi Chú Yêu Cầu Kỹ Thuật": "Dung sai phôi đúc +-0.5mm"
                },
                {
                    "Khách Hàng (*)": "Win-Win",
                    "Tên Sản Phẩm (*)": "Trục Khuỷu Động Cơ Φ250",
                    "Tên Nguyên Công (*)": "NC2: Phay CNC rãnh kẹp",
                    "Định Mức (Giây/s)": 3600,
                    "Lương Khoán (VNĐ)": 45000,
                    "Máy Gia Công Default": "Máy Phay OKK1",
                    "Ghi Chú Yêu Cầu Kỹ Thuật": "Rãnh vạt góc R2.5"
                },
                {
                    "Khách Hàng (*)": "Win-Win",
                    "Tên Sản Phẩm (*)": "Trục Khuỷu Động Cơ Φ250",
                    "Tên Nguyên Công (*)": "NC3: Khoan 8 lỗ tâm Φ18",
                    "Định Mức (Giây/s)": 1800,
                    "Lương Khoán (VNĐ)": 25000,
                    "Máy Gia Công Default": "Máy Khoan Cần",
                    "Ghi Chú Yêu Cầu Kỹ Thuật": "Vít taro M16"
                },
                {
                    "Khách Hàng (*)": "Win-Win",
                    "Tên Sản Phẩm (*)": "Trục Khuỷu Động Cơ Φ250",
                    "Tên Nguyên Công (*)": "NC4: Mài hoàn thiện cổ trục",
                    "Định Mức (Giây/s)": 2400,
                    "Lương Khoán (VNĐ)": 30000,
                    "Máy Gia Công Default": "Máy Mài OKK",
                    "Ghi Chú Yêu Cầu Kỹ Thuật": "Độ bóng Ra 0.8"
                },
                {
                    "Khách Hàng (*)": "UCC",
                    "Tên Sản Phẩm (*)": "Nắp Thùng Máy Đột AMC",
                    "Tên Nguyên Công (*)": "NC1: Phay thô mp1 & mp2",
                    "Định Mức (Giây/s)": 3000,
                    "Lương Khoán (VNĐ)": 40000,
                    "Máy Gia Công Default": "Máy Phay CNC1",
                    "Ghi Chú Yêu Cầu Kỹ Thuật": "Phay 2 mặt đạt 12mm"
                }
            ];

            if (typeof XLSX !== 'undefined') {
                const worksheet = XLSX.utils.json_to_sheet(templateData);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "Mau_Quy_Trinh");
                XLSX.writeFile(workbook, "Mau_Quy_Trinh_Cong_Nghe_GCCK_Template.xlsx");
                showToast("📄 Đã tải thành công File Excel Mẫu Quy trình Công nghệ!", "success");
            } else {
                showToast("Đang kết nối thư viện Excel...", "info");
            }
        });
    }

    if (btnImportMasterExcel && masterExcelFileInput) {
        btnImportMasterExcel.addEventListener('click', () => {
            const files = masterExcelFileInput.files;
            if (!files || !files[0]) {
                showToast('Vui lòng chọn 1 File Excel (.xlsx, .xlsm) chứa dữ liệu mới!', 'warning');
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });

                    let countAdded = 0;
                    workbook.SheetNames.forEach(sheetName => {
                        const sheet = workbook.Sheets[sheetName];
                        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                        
                        let custCol = 0, prodCol = 1, opCol = 2, timeCol = 3, wageCol = 4, machineCol = 5;

                        rows.forEach((row, idx) => {
                            if (!row || row.length === 0) return;

                            // Dynamic header column detection
                            if (idx === 0) {
                                row.forEach((cellText, cIdx) => {
                                    const str = String(cellText || '').toLowerCase().trim();
                                    if (str.includes('khách hàng') || str.includes('customer')) custCol = cIdx;
                                    else if (str.includes('sản phẩm') || str.includes('product')) prodCol = cIdx;
                                    else if (str.includes('nguyên công') || str.includes('công đoạn') || str.includes('op')) opCol = cIdx;
                                    else if (str.includes('định mức') || str.includes('giây') || str.includes('thời gian')) timeCol = cIdx;
                                    else if (str.includes('lương') || str.includes('khoán') || str.includes('giá')) wageCol = cIdx;
                                    else if (str.includes('máy') || str.includes('machine')) machineCol = cIdx;
                                });
                                return;
                            }

                            if (row.length >= 3) {
                                const cust = row[custCol] ? String(row[custCol]).trim() : 'Khách hàng mới';
                                const prod = row[prodCol] ? String(row[prodCol]).trim() : '';
                                const op = row[opCol] ? String(row[opCol]).trim() : '';

                                // Parse Time in seconds (Column D)
                                let timeSec = 1800;
                                if (row[timeCol] !== undefined && row[timeCol] !== null && row[timeCol] !== '') {
                                    const rawT = parseFloat(String(row[timeCol]).replace(/,/g, ''));
                                    if (!isNaN(rawT) && rawT > 0) timeSec = rawT;
                                }

                                // Parse Wage in VND (Column E)
                                let wage = 0;
                                if (row[wageCol] !== undefined && row[wageCol] !== null && row[wageCol] !== '') {
                                    const rawW = parseFloat(String(row[wageCol]).replace(/,/g, ''));
                                    if (!isNaN(rawW) && rawW > 0) wage = rawW;
                                }

                                // Auto-compute Piece-Rate Wage if left empty in Excel: 60,000 VNĐ / hour
                                if (wage <= 0 && timeSec > 0) {
                                    wage = Math.round((timeSec / 3600) * 60000);
                                }
                                if (wage <= 0) wage = 35000;

                                // Parse Machine (Column F)
                                const defaultMachine = row[machineCol] ? String(row[machineCol]).trim() : '';

                                if (prod && op) {
                                    const canonicalCust = window.getCanonicalCustomerKey(cust);
                                    const canonicalProd = window.getCanonicalProductKey(prod);

                                    if (!window.AppData.customers.includes(canonicalCust)) window.AppData.customers.push(canonicalCust);
                                    if (!window.AppData.productsByCustomer) window.AppData.productsByCustomer = {};
                                    if (!window.AppData.productsByCustomer[canonicalCust]) window.AppData.productsByCustomer[canonicalCust] = [];
                                    if (!window.AppData.productsByCustomer[canonicalCust].includes(canonicalProd)) window.AppData.productsByCustomer[canonicalCust].push(canonicalProd);
                                    if (!window.AppData.operationsByProduct) window.AppData.operationsByProduct = {};
                                    if (!window.AppData.operationsByProduct[canonicalProd]) window.AppData.operationsByProduct[canonicalProd] = [];
                                    
                                    const targetArr = window.AppData.operationsByProduct[canonicalProd];
                                    const existingOp = targetArr.find(o => (typeof o === 'string' ? o : o.op) === op);
                                    if (!existingOp) {
                                        targetArr.push({ op: op, time_s: timeSec, machine: defaultMachine });
                                    } else if (typeof existingOp === 'object') {
                                        existingOp.time_s = timeSec;
                                        if (defaultMachine) existingOp.machine = defaultMachine;
                                    }
                                    if (!window.AppData.operationWages) window.AppData.operationWages = {};
                                    window.AppData.operationWages[`${canonicalProd}___${op}`] = wage;
                                    window.AppData.operationWages[`${prod}___${op}`] = wage;
                                    countAdded++;
                                }
                            }
                        });
                    });

                    localStorage.setItem('GCCK_APP_DATA', JSON.stringify(window.AppData));
                    initDropdowns();
                    pushMasterDataToCloud();
                    showToast(`📥 ĐÃ NẠP THÀNH CÔNG ${countAdded} NGUYÊN CÔNG TỪ EXCEL (ĐÃ CẬP NHẬT LƯƠNG KHOÁN & ĐỊNH MỨC)!`, 'success');
                } catch (err) {
                    showToast('Lỗi đọc file Excel: ' + err.message, 'danger');
                }
            };
            reader.readAsArrayBuffer(files[0]);
        });
    }

    // 14. Google Sheets Config Link Button Listener
    const googleScriptUrlInput = document.getElementById('googleScriptUrlInput');
    const btnSaveGoogleUrl = document.getElementById('btnSaveGoogleUrl');
    
    if (googleScriptUrlInput && btnSaveGoogleUrl) {
        const savedUrl = localStorage.getItem('GOOGLE_SCRIPT_URL') || (window.AppData && window.AppData.googleScriptUrl) || (window.INITIAL_DATA && window.INITIAL_DATA.googleScriptUrl) || DEFAULT_GOOGLE_SCRIPT_URL;
        if (savedUrl) googleScriptUrlInput.value = savedUrl;

        btnSaveGoogleUrl.addEventListener('click', () => {
            const url = googleScriptUrlInput.value.trim();
            if (url) {
                localStorage.setItem('GOOGLE_SCRIPT_URL', url);
                if (!window.AppData) window.AppData = {};
                window.AppData.googleScriptUrl = url;
                localStorage.setItem('GCCK_APP_DATA', JSON.stringify(window.AppData));
                showToast('✅ Đã lưu Cấu hình kết nối Google Sheets đồng bộ mọi thiết bị!', 'success');
            } else {
                localStorage.removeItem('GOOGLE_SCRIPT_URL');
                if (window.AppData) delete window.AppData.googleScriptUrl;
                localStorage.setItem('GCCK_APP_DATA', JSON.stringify(window.AppData));
                showToast('Đã xóa kết nối Google Sheets', 'info');
            }
        });
    }

    // 14. 1-Click Excel Export Functionality
    if (btnExportExcel) {
        btnExportExcel.addEventListener('click', () => {
            const logs = window.AppData.historyLogs;
            
            const excelRows = logs.map((l, idx) => ({
                "STT": idx + 1,
                "Người làm": l.worker,
                "Tên sản phẩm": l.product,
                "Khách hàng": l.customer,
                "Số PO": l.po,
                "Ngày": l.date,
                "Công đoạn": l.op,
                "SL Đạt": l.qty_dat,
                "SL Xử lý": l.qty_xuly,
                "SL Hủy": l.qty_huy,
                "Lương khoán (VNĐ)": l.total_wage || ((l.qty_dat || 1) * 45000),
                "Máy gia công": l.machine,
                "Vật tư tiêu hao": l.material,
                "Số lượng tiêu hao": l.qty_material || 0,
                "Thời gian phát sinh (Phút)": l.downtime_min,
                "Ghi chú phát sinh": l.downtime_note
            }));

            if (typeof XLSX !== 'undefined') {
                const worksheet = XLSX.utils.json_to_sheet(excelRows);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "BaoCaoSanLuong");
                XLSX.writeFile(workbook, `Bao_Cao_San_Luong_GCCK_${new Date().toISOString().split('T')[0]}.xlsx`);
                showToast("📥 Đã xuất thành công file Excel Báo cáo ngày!", "success");
            } else {
                showToast("Đang kết nối thư viện Excel...", "info");
            }
        });
    }

    // 15. Admin Dashboard Rendering
    function renderAdminDashboard() {
        const logs = window.AppData.historyLogs;
        
        let totalDat = 0;
        let totalXuLy = 0;
        let totalHuy = 0;
        let totalDowntime = 0;

        logs.forEach(l => {
            totalDat += (l.qty_dat || 0);
            totalXuLy += (l.qty_xuly || 0);
            totalHuy += (l.qty_huy || 0);
            totalDowntime += (l.downtime_min || 0);
        });

        document.getElementById('statTotalDat').textContent = totalDat.toLocaleString();
        document.getElementById('statTotalXuLy').textContent = totalXuLy.toLocaleString();
        document.getElementById('statTotalHuy').textContent = totalHuy.toLocaleString();
        document.getElementById('statTotalDowntime').textContent = `${totalDowntime} phút`;

        renderWipProgressTable();

        const tbody = document.getElementById('historyLogTbody');
        if (tbody) {
            tbody.innerHTML = '';

            logs.forEach(log => {
                const tr = document.createElement('tr');
                const wage = log.total_wage || ((log.qty_dat || 1) * 45000);
                const allImgs = [...(log.product_photos || []), ...(log.photos || [])];
                const photoCell = (allImgs.length > 0) 
                    ? `<img src="${allImgs[0]}" style="width:36px; height:36px; border-radius:4px; object-fit:cover; cursor:pointer;" onclick="window.open('${allImgs[0]}')">` 
                    : '<span style="color:#64748b;">Không có</span>';

                tr.innerHTML = `
                    <td><strong>${log.worker}</strong></td>
                    <td>${log.customer}</td>
                    <td><span style="color:#60a5fa; font-weight:600;">${log.product}</span></td>
                    <td>${log.op}</td>
                    <td>${log.machine}</td>
                    <td><span class="badge badge-success">${log.qty_dat}</span></td>
                    <td><span class="badge badge-warning">${log.qty_xuly}</span></td>
                    <td><span class="badge badge-danger">${log.qty_huy}</span></td>
                    <td><strong style="color:#34d399">${wage.toLocaleString()} đ</strong></td>
                    <td>${log.material} (${log.qty_material || 0})</td>
                    <td>${log.downtime_min > 0 ? `<span style="color:#fbbf24">${log.downtime_min} phút</span>` : '0'}</td>
                    <td>${photoCell}</td>
                    <td>${log.date}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    }

    // Render Realtime WIP Progress Table (Weighted completion % per product)
    function renderWipProgressTable() {
        const tbody = document.getElementById('wipProgressTbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!window.AppData || !window.AppData.operationsByProduct) return;

        const logs = window.AppData.historyLogs || [];

        // Group logs by product
        const completedMap = {}; // { prodClean: { opClean: totalQty } }
        logs.forEach(l => {
            const pClean = window.cleanKey(l.product);
            const opClean = window.cleanKey(l.op);
            if (!completedMap[pClean]) completedMap[pClean] = {};
            if (!completedMap[pClean][opClean]) completedMap[pClean][opClean] = 0;
            completedMap[pClean][opClean] += (l.qty_dat || 0);
        });

        // Loop over products
        const products = Object.keys(window.AppData.operationsByProduct);
        products.forEach(prodName => {
            const ops = window.AppData.operationsByProduct[prodName];
            if (!Array.isArray(ops) || ops.length === 0) return;

            // Find customer
            let custName = 'Khách hàng';
            if (window.AppData.productsByCustomer) {
                Object.keys(window.AppData.productsByCustomer).forEach(c => {
                    const arr = window.AppData.productsByCustomer[c];
                    if (Array.isArray(arr) && arr.some(p => window.cleanKey(p) === window.cleanKey(prodName))) {
                        custName = c;
                    }
                });
            }

            const pClean = window.cleanKey(prodName);
            const prodLogs = completedMap[pClean] || {};

            let totalNormSec = 0;
            let completedNormSec = 0;
            let finishedOpsCount = 0;
            let opProgressBadges = [];

            ops.forEach((opObj, idx) => {
                const opName = typeof opObj === 'string' ? opObj : (opObj ? opObj.op : '');
                const timeSec = typeof opObj === 'object' && opObj.time_s ? opObj.time_s : 1800;
                totalNormSec += timeSec;

                const doneQty = prodLogs[window.cleanKey(opName)] || 0;
                if (doneQty > 0) {
                    completedNormSec += Math.min(1, doneQty) * timeSec; // Normalized per unit batch
                    finishedOpsCount++;
                    opProgressBadges.push(`<span class="badge badge-success" style="font-size:10px; margin:2px;">NC${idx+1}: ${doneQty} SP</span>`);
                } else {
                    opProgressBadges.push(`<span style="font-size:10px; color:#64748b; margin:2px;">NC${idx+1}: 0</span>`);
                }
            });

            const percent = totalNormSec > 0 ? Math.min(100, Math.round((completedNormSec / totalNormSec) * 100)) : 0;
            
            let statusColor = '#60a5fa';
            let statusText = '🟡 Đang gia công';
            if (percent === 100) {
                statusColor = '#34d399';
                statusText = '🟢 Hoàn thành 100%';
            } else if (percent === 0) {
                statusColor = '#94a3b8';
                statusText = '⚪ Chưa sản xuất';
            } else {
                statusColor = '#fbbf24';
                statusText = `🟡 Hoàn thành ${finishedOpsCount}/${ops.length} NC`;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${custName}</strong></td>
                <td><span style="color:#60a5fa; font-weight:700;">${prodName}</span> <br><small style="color:#94a3b8;">(${ops.length} nguyên công)</small></td>
                <td><strong>${Math.round(totalNormSec/60)} phút</strong> <br><small style="color:#64748b;">(${totalNormSec}s)</small></td>
                <td>${opProgressBadges.join(' ')}</td>
                <td style="min-width: 140px;">
                    <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:2px;">
                        <span style="color:${statusColor}; font-weight:bold;">${percent}%</span>
                        <span style="color:#94a3b8;">${finishedOpsCount}/${ops.length} CĐ</span>
                    </div>
                    <div style="background:#1e293b; height:8px; border-radius:4px; overflow:hidden;">
                        <div style="background:${statusColor}; height:100%; width:${percent}%; transition:width 0.5s;"></div>
                    </div>
                </td>
                <td><span style="color:${statusColor}; font-weight:600; font-size:12px;">${statusText}</span></td>
            `;
            tbody.appendChild(tr);
        });
    }

    // 16. Toast Helper
    function showToast(msg, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span>${msg}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3500);
    }

    // 🌐 Realtime Cloud Sync for Master Data across all worker devices
    function pushMasterDataToCloud() {
        const scriptUrl = DEFAULT_GOOGLE_SCRIPT_URL;
        if (!scriptUrl) return;

        const payload = {
            action: 'saveMasterData',
            masterData: {
                customers: window.AppData.customers || [],
                productsByCustomer: window.AppData.productsByCustomer || {},
                operationsByProduct: window.AppData.operationsByProduct || {},
                operationWages: window.AppData.operationWages || {},
                userAccounts: window.AppData.userAccounts || []
            }
        };

        fetch(scriptUrl, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
            console.log('☁️ Master Data synced to Cloud:', data);
            showToast('☁️ Đã đồng bộ Sản phẩm & Nguyên công mới tới TẤT CẢ điện thoại công nhân!', 'success');
        })
        .catch(err => {
            console.log('⚠️ Could not sync Master Data to Cloud:', err);
        });
    }

    function fetchMasterDataFromCloud() {
        const scriptUrl = DEFAULT_GOOGLE_SCRIPT_URL;
        if (!scriptUrl) return;

        fetch(scriptUrl)
        .then(res => res.json())
        .then(data => {
            if (data && data.result === 'success' && data.masterData) {
                const cloudData = data.masterData;
                let isUpdated = false;

                if (cloudData.customers && Array.isArray(cloudData.customers)) {
                    cloudData.customers.forEach(c => {
                        if (!window.AppData.customers.includes(c)) {
                            window.AppData.customers.push(c);
                            isUpdated = true;
                        }
                    });
                }

                if (cloudData.productsByCustomer) {
                    if (!window.AppData.productsByCustomer) window.AppData.productsByCustomer = {};
                    Object.keys(cloudData.productsByCustomer).forEach(cust => {
                        if (!window.AppData.productsByCustomer[cust]) {
                            window.AppData.productsByCustomer[cust] = cloudData.productsByCustomer[cust];
                            isUpdated = true;
                        } else {
                            cloudData.productsByCustomer[cust].forEach(p => {
                                if (!window.AppData.productsByCustomer[cust].includes(p)) {
                                    window.AppData.productsByCustomer[cust].push(p);
                                    isUpdated = true;
                                }
                            });
                        }
                    });
                }

                if (cloudData.operationsByProduct) {
                    if (!window.AppData.operationsByProduct) window.AppData.operationsByProduct = {};
                    Object.keys(cloudData.operationsByProduct).forEach(prod => {
                        if (!window.AppData.operationsByProduct[prod]) {
                            window.AppData.operationsByProduct[prod] = cloudData.operationsByProduct[prod];
                            isUpdated = true;
                        } else {
                            cloudData.operationsByProduct[prod].forEach(opItem => {
                                const exists = window.AppData.operationsByProduct[prod].find(o => o.op === opItem.op);
                                if (!exists) {
                                    window.AppData.operationsByProduct[prod].push(opItem);
                                    isUpdated = true;
                                }
                            });
                        }
                    });
                }

                if (cloudData.operationWages) {
                    if (!window.AppData.operationWages) window.AppData.operationWages = {};
                    Object.assign(window.AppData.operationWages, cloudData.operationWages);
                }

                if (isUpdated) {
                    localStorage.setItem('GCCK_APP_DATA', JSON.stringify(window.AppData));
                    initDropdowns();
                    showToast('🔄 Tự động cập nhật Sản phẩm & Nguyên công mới từ Admin!', 'info');
                }
            }
        })
        .catch(err => {
            console.log('⚠️ Master Data cloud fetch error:', err);
        });
    }

    // Initialize Everything
    checkAuthSession();
    initDropdowns();
    fetchMasterDataFromCloud();
});
