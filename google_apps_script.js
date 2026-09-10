// ==============================================================================
// CẤU HÌNH GOOGLE DRIVE, TELEGRAM BOT & MINI APP
// ==============================================================================
var SPREADSHEET_ID = "1p1xE6AT0ullmXl7R4BQOPxwEPH3wxzGkyPuxdk529h8"; // ID chuẩn xác từ file Google Sheet của bạn (Để trống hệ thống tự tạo)
var PRODUCT_FOLDER_ID = ""; // Ví dụ: "1A2b3C4d5E6f7G..." (Để trống hệ thống tự tạo)
var SCRAP_FOLDER_ID = "";   // Ví dụ: "9Z8y7X6w5V4u3T..." (Để trống hệ thống tự tạo)

// 🤖 CẤU HÌNH TELEGRAM BOT TỰ ĐỘNG CẢNH BÁO
var TELEGRAM_BOT_TOKEN = "8871498341:AAFTzNNaCNXZlaTJlh8znudxrYFs69bu74s";
// Dán Token Bot lấy từ @BotFather vào đây (Ví dụ: "8871498341:AAFTz...")
var TELEGRAM_CHAT_ID = "-5457065729";   // Dán Chat ID Nhóm Telegram xưởng vào đây (Ví dụ: "-100123456789")

// 🌐 URL Mini App Sản Lượng của bạn (Netlify hoặc GitHub Pages)
var MINI_APP_URL = "https://happiness2286-dot.github.io/sanluonggcck/";       // Dán link GitHub Pages (ví dụ: "https://ten-ban.github.io/SANLUONG2026/") hoặc Netlify vào đây!

// 🟢 HÀM MỞ GOOGLE SHEET AN TOÀN (HỖ TRỢ CẢ THỦ CÔNG, BỘ HẸN GIỜ TRIGGERS & STANDALONE SCRIPT)
function getSpreadsheet() {
  if (typeof SPREADSHEET_ID !== 'undefined' && SPREADSHEET_ID && SPREADSHEET_ID.trim() !== "") {
    try {
      return SpreadsheetApp.openById(SPREADSHEET_ID.trim());
    } catch (eId) {
      console.log("⚠️ Không mở được qua SPREADSHEET_ID: " + eId.toString());
    }
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error("❌ Không tìm thấy Bảng tính Google Sheet! Vui lòng mở từ Tiện ích mở rộng -> Apps Script trên Sheet hoặc điền SPREADSHEET_ID ở dòng 4.");
  }
  return ss;
}

function doGet(e) {
  try {
    var ss = getSpreadsheet();
    var masterSheet = ss.getSheetByName("Danh Mục Master");
    if (!masterSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        "result": "empty",
        "message": "Chưa có Master Data trên Cloud"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var cellVal = masterSheet.getRange("A2").getValue();
    if (!cellVal) {
      return ContentService.createTextOutput(JSON.stringify({
        "result": "empty"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var masterData = JSON.parse(cellVal);
    return ContentService.createTextOutput(JSON.stringify({
      "result": "success",
      "masterData": masterData
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      "result": "error",
      "message": err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    // 1. Mở Sheet "Nhật Ký Sản Lượng" (Hoặc Sheet đầu tiên)
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("Nhật Ký Sản Lượng");
    if (!sheet) {
      sheet = ss.getSheets()[0];
    }

    // 2. Đọc dữ liệu JSON gửi từ điện thoại công nhân
    var contents = (e && e.postData && e.postData.contents) ? e.postData.contents : "{}";
    var data = JSON.parse(contents);

    // XỬ LÝ LƯU DANH MỤC MASTER (SẢN PHẨM, NGUYÊN CÔNG & CÔNG NHÂN) TỪ ADMIN
    if (data.action === "saveMasterData" && data.masterData) {
      var masterSheet = ss.getSheetByName("Danh Mục Master");
      if (!masterSheet) {
        masterSheet = ss.insertSheet("Danh Mục Master");
        masterSheet.appendRow(["CƠ SỞ DỮ LIỆU DANH MỤC MASTER (JSON)"]);
      }
      masterSheet.getRange("A2").setValue(JSON.stringify(data.masterData));

      // Tự động đảm bảo Sheet "Đơn Hàng" & Sheet "Giao Hàng" được khởi tạo chuẩn mẫu
      try { createDonHangGiaoHangSheets(); } catch (eDh) { console.log(eDh); }

      // Đồng bộ tự động danh sách Công Nhân từ Master Data sang Sheet "Danh Sách Công Nhân"
      if (data.masterData.userAccounts && Array.isArray(data.masterData.userAccounts)) {
        var wSheet = ss.getSheetByName("Danh Sách Công Nhân") || ss.insertSheet("Danh Sách Công Nhân");
        var existingNames = new Set();
        var currentData = wSheet.getDataRange().getValues();

        if (currentData.length <= 1) {
          wSheet.clear();
          wSheet.appendRow(["Họ Và Tên Công Nhân", "Tài Khoản / Mã", "Trạng Thái"]);
        } else {
          for (var r = 1; r < currentData.length; r++) {
            if (currentData[r][0]) existingNames.add(String(currentData[r][0]).trim());
          }
        }

        data.masterData.userAccounts.forEach(function (acc) {
          var name = acc.fullName || acc.username;
          if (name && !existingNames.has(name.trim())) {
            wSheet.appendRow([name.trim(), acc.username || "", "Đang làm việc"]);
            existingNames.add(name.trim());
          }
        });
      }

      return ContentService.createTextOutput(JSON.stringify({
        "result": "success",
        "message": "Đã đồng bộ thành công Sản phẩm, Nguyên công & Công nhân mới lên Cloud!"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // XỬ LÝ LƯU HOẶC CẬP NHẬT ĐƠN HÀNG TỪ ADMIN
    if (data.action === "saveOrderData" && data.order) {
      var sheets = createDonHangGiaoHangSheets();
      var orderSheet = sheets.orderSheet;
      var o = data.order;
      var oPo = String(o.po || "").trim();

      var oRows = orderSheet.getDataRange().getValues();
      var foundRow = -1;

      for (var r = 1; r < oRows.length; r++) {
        if (String(oRows[r][1]).trim().toLowerCase() === oPo.toLowerCase()) {
          foundRow = r + 1;
          break;
        }
      }

      var qtyPlan = Number(o.qty_plan || 0);

      if (foundRow > 1) {
        // Cập nhật dòng PO hiện có
        orderSheet.getRange(foundRow, 3).setValue(o.customer || "");
        orderSheet.getRange(foundRow, 4).setValue(o.product || "");
        orderSheet.getRange(foundRow, 5).setValue(o.product_code || "");
        orderSheet.getRange(foundRow, 6).setValue(qtyPlan);
        orderSheet.getRange(foundRow, 11).setValue(o.order_date || "");
        orderSheet.getRange(foundRow, 12).setValue(o.deadline || "");
        if (o.note) orderSheet.getRange(foundRow, 14).setValue(o.note);
      } else {
        // Thêm PO mới vào dòng cuối
        var nextSttOrder = oRows.length;
        var rIdx = nextSttOrder + 1;
        var formulaGiaCong = "=SUMIFS('Nhật Ký Sản Lượng'!J:J, 'Nhật Ký Sản Lượng'!G:G, B" + rIdx + ")";
        var formulaGiaoHang = "=SUMIFS('Giao Hàng'!F:F, 'Giao Hàng'!C:C, B" + rIdx + ")";
        var formulaConNo = "=F" + rIdx + "-H" + rIdx;
        var formulaTonKho = "=G" + rIdx + "-H" + rIdx;
        var formulaStatus = '=IF(H' + rIdx + '>=F' + rIdx + ', "Đã giao đủ", IF(G' + rIdx + '>=F' + rIdx + ', "Đã sản xuất xong - Chờ giao", IF(G' + rIdx + '>0, "Đang sản xuất", "Chưa sản xuất")))';

        orderSheet.appendRow([
          nextSttOrder,
          oPo,
          o.customer || "",
          o.product || "",
          o.product_code || "",
          qtyPlan,
          formulaGiaCong,
          formulaGiaoHang,
          formulaConNo,
          formulaTonKho,
          o.order_date || "",
          o.deadline || "",
          formulaStatus,
          o.note || ""
        ]);
      }

      return ContentService.createTextOutput(JSON.stringify({
        "result": "success",
        "message": "Đã lưu & đồng bộ Đơn hàng lên Google Sheet 'Đơn Hàng'!"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // XỬ LÝ LƯU THÔNG TIN GIAO HÀNG TỪ ADMIN / PHÒNG KHO
    if (data.action === "saveDeliveryData" && data.delivery) {
      var sheets = createDonHangGiaoHangSheets();
      var delSheet = sheets.delSheet;
      var d = data.delivery;
      var dRows = delSheet.getDataRange().getValues();
      var nextSttDel = dRows.length;

      delSheet.appendRow([
        nextSttDel,
        d.delivery_date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd"),
        String(d.po || "").trim(),
        d.customer || "",
        d.product || "",
        Number(d.qty_delivered || 0),
        d.unit || "Cái",
        d.vehicle_info || "",
        d.shipper || "",
        d.note || ""
      ]);

      return ContentService.createTextOutput(JSON.stringify({
        "result": "success",
        "message": "Đã ghi nhận phiếu giao hàng lên Google Sheet 'Giao Hàng'!"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 3. Tính số thứ tự STT dòng tiếp theo
    var lastRow = sheet.getLastRow();
    var nextStt = lastRow > 1 ? lastRow - 1 : 1;

    // 4. Xử lý TỰ ĐỘNG UPLOAD ÁNH SẢN PHẨM & ÁNH PHẾ PHẨM LÊN GOOGLE DRIVE
    var uploadPhotosToDrive = function (photoArray, folderName, filePrefix, customFolderId) {
      var urls = [];
      if (!photoArray || !Array.isArray(photoArray) || photoArray.length === 0) return urls;
      try {
        var folder;
        if (customFolderId && customFolderId.trim() !== "") {
          try {
            folder = DriveApp.getFolderById(customFolderId.trim());
          } catch (eFolder) {
            console.log("Không tìm thấy Folder ID chỉ định, tự tạo theo tên: " + eFolder.toString());
          }
        }
        if (!folder) {
          var folders = DriveApp.getFoldersByName(folderName);
          folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
        }

        for (var i = 0; i < photoArray.length; i++) {
          var rawPhoto = photoArray[i];
          if (rawPhoto && typeof rawPhoto === 'string') {
            if (rawPhoto.indexOf("data:image") >= 0 || rawPhoto.length > 100) {
              var base64Data = rawPhoto;
              var mimeType = "image/jpeg";

              if (rawPhoto.indexOf("data:image") >= 0) {
                var parts = rawPhoto.split(",");
                var mimeMatch = parts[0].match(/:(.*?);/);
                if (mimeMatch) mimeType = mimeMatch[1];
                base64Data = parts[1] || parts[0];
              }

              var fileName = filePrefix + "_" + (data.worker || "Worker").replace(/\s+/g, "_") + "_" + (data.date || "") + "_STT" + nextStt + "_" + (i + 1) + ".jpg";
              var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
              var file = folder.createFile(blob);

              file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
              urls.push(file.getUrl());
            } else if (rawPhoto.indexOf("http") === 0) {
              urls.push(rawPhoto);
            }
          }
        }
      } catch (errDrive) {
        console.log("Lỗi tạo file ảnh trên Google Drive (" + folderName + "): " + errDrive.toString());
      }
      return urls;
    };

    // Upload Ảnh Sản Phẩm Thành Phẩm & Ảnh Phế Phẩm
    var productPhotoUrls = uploadPhotosToDrive(data.product_photos, "Ảnh Báo Cáo Thành Phẩm GCCK 2026", "Anh_SanPham", PRODUCT_FOLDER_ID);
    var scrapPhotoUrls = uploadPhotosToDrive(data.photos, "Ảnh Báo Cáo Phế Phẩm GCCK 2026", "Anh_PhePham", SCRAP_FOLDER_ID);

    var allDriveUrls = [].concat(
      productPhotoUrls.map(function (u) { return "[Sản Phẩm]: " + u; }),
      scrapPhotoUrls.map(function (u) { return "[Phế Phẩm]: " + u; })
    );

    var photoCellContent = allDriveUrls.length > 0 ? allDriveUrls.join("\n") : "Không có ảnh";

    // 5. Thêm 1 dòng báo cáo sản lượng mới vào Google Sheets (Có đính kèm Link Google Drive)
    sheet.appendRow([
      nextStt,                     // STT
      new Date(),                  // Thời gian gửi hệ thống
      data.date || '',             // Ngày làm
      data.worker || '',           // Họ tên công nhân
      data.customer || '',         // Khách hàng
      data.product || '',          // Tên sản phẩm
      data.po || '',               // Số PO
      data.op || '',               // Nguyên công / Công đoạn
      data.machine || '',          // Máy gia công
      data.qty_dat || 0,           // SL Đạt (OK)
      data.qty_xuly || 0,          // SL Xử lý (Rework)
      data.qty_huy || 0,           // SL Hủy (Scrap)
      data.total_wage || 0,        // Lương khoán tạm tính (VNĐ)
      data.material || '',         // Vật tư / Chip dao
      data.qty_material || 0,      // Số lượng tiêu hao
      data.downtime_min || 0,      // Phát sinh dừng máy (Phút)
      data.downtime_note || '',    // Ghi chú phát sinh
      photoCellContent             // Link Google Drive hình ảnh sản phẩm & phế phẩm
    ]);

    // Tự động kiểm tra và thêm PO vào Sheet "Đơn Hàng" nếu chưa có
    if (data.po && String(data.po).trim() !== '') {
      autoSyncSinglePoToOrderSheet(String(data.po).trim(), data.customer || '', data.product || '');
    }

    // 6. Trả về phản hồi XÁC NHẬN THÀNH CÔNG cho Mini App
    return ContentService.createTextOutput(JSON.stringify({
      "result": "success",
      "message": "Đã lưu sản lượng và tải ảnh lên Google Drive thành công!"
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      "result": "error",
      "message": err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ==============================================================================
// 7. HÀM TỰ ĐỘNG ĐỐI SOÁT & CẢNH BÁO QUÁ HẠN BÁO CÁO QUA TELEGRAM BOT
// ==============================================================================

// Chạy tự động sau Ca 1 (Lúc 14h:15)
function checkShift1_14h() {
  checkOverdueReports("Ca 1 (Sáng)");
}

// Chạy tự động sau Ca 2 (Lúc 22h:15)
function checkShift2_22h() {
  checkOverdueReports("Ca 2 (Chiều)");
}

// Chạy tự động sau Ca 3 (Lúc 06h:15 sáng hôm sau)
function checkShift3_06h() {
  checkOverdueReports("Ca 3 (Đêm)");
}

function checkOverdueReports(shiftName) {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("Nhật Ký Sản Lượng");
    if (!sheet) sheet = ss.getSheets()[0];

    var todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    var todayShortStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");

    var data = sheet.getDataRange().getValues();
    var reportedWorkers = new Set();

    // Duyệt danh sách các báo cáo đã nộp hôm nay (Cột D là Tên Công Nhân - Index 3)
    for (var i = 1; i < data.length; i++) {
      var rowDate = data[i][2]; // Cột Ngày làm
      var workerName = data[i][3]; // Cột Công nhân

      var isToday = false;
      if (rowDate instanceof Date) {
        var rDateStr = Utilities.formatDate(rowDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
        if (rDateStr === todayStr) isToday = true;
      } else if (typeof rowDate === 'string' && (rowDate.includes(todayStr) || rowDate.includes(todayShortStr))) {
        isToday = true;
      }

      if (isToday && workerName) {
        reportedWorkers.add(String(workerName).trim());
      }
    }

    // Danh sách 15 công nhân mặc định từ cơ sở dữ liệu gốc của dự án
    var DEFAULT_WORKERS = [
      "Hoàng Ngọc Hà", "Nguyễn Trung Đông", "Phùng Đình Hùng", "Vũ Tiến Thuận",
      "Nguyễn Mạnh Hà", "Nguyễn Văn Thanh", "Phùng Gia Phúc", "Trần Văn Dũng",
      "Trần Đăng Ninh", "Phạm Văn Tráng", "Phùng Công Thắng", "Phạm Ngọc Sam",
      "Trần Văn Quỳnh", "Đinh Văn Nhận", "Đặng Ngọc Long"
    ];

    // Đọc danh sách Công nhân 100% trực tiếp từ Google Sheet "Danh Sách Công Nhân"
    var allWorkers = [];
    var workerSheet = ss.getSheetByName("Danh Sách Công Nhân") || ss.getSheetByName("CongNhan");

    // Nếu chưa có Sheet "Danh Sách Công Nhân", tự động tạo Sheet chuẩn & điền sẵn 15 công nhân gốc
    if (!workerSheet) {
      workerSheet = ss.insertSheet("Danh Sách Công Nhân");
      workerSheet.appendRow(["Họ Và Tên Công Nhân", "Tài Khoản / Mã", "Trạng Thái"]);
      DEFAULT_WORKERS.forEach(function (wName, idx) {
        workerSheet.appendRow([wName, "NV" + (idx + 1 < 10 ? "0" + (idx + 1) : (idx + 1)), "Đang làm"]);
      });
      console.log("✅ Đã tự động khởi tạo Sheet 'Danh Sách Công Nhân' với 15 công nhân gốc của dự án!");
    }

    // Đọc dữ liệu công nhân từ Sheet "Danh Sách Công Nhân"
    var wData = workerSheet.getDataRange().getValues();
    for (var w = 1; w < wData.length; w++) {
      var name = wData[w][0] ? String(wData[w][0]).trim() : '';
      var status = wData[w][2] ? String(wData[w][2]).trim().toLowerCase() : '';

      // Bỏ qua dòng tiêu đề hoặc công nhân đã đánh dấu "Đã nghỉ" / "Nghỉ việc"
      if (name && name !== "Họ Và Tên Công Nhân" && status !== "nghỉ việc" && status !== "đã nghỉ") {
        allWorkers.push(name);
      }
    }

    // Nếu Sheet vẫn rỗng (do Quản đốc lỡ xóa hết dòng), dùng mặc định 15 công nhân gốc
    if (allWorkers.length === 0) {
      allWorkers = DEFAULT_WORKERS.slice();
      // Tự động điền lại vào Sheet cho Quản đốc
      if (workerSheet.getLastRow() <= 1) {
        DEFAULT_WORKERS.forEach(function (wName, idx) {
          workerSheet.appendRow([wName, "NV" + (idx + 1 < 10 ? "0" + (idx + 1) : (idx + 1)), "Đang làm"]);
        });
      }
    }

    // Lọc công nhân chưa nộp báo cáo
    var missingWorkers = [];
    allWorkers.forEach(function (w) {
      if (!reportedWorkers.has(w)) {
        missingWorkers.push(w);
      }
    });

    if (missingWorkers.length === 0) {
      console.log("✅ Tất cả công nhân đã nộp báo cáo sản lượng đầy đủ cho " + shiftName + "!");
      return;
    }

    // Soạn tin nhắn HTML cảnh báo cho Telegram
    var messageText = "<b>⚠️ CẢNH BÁO QUÁ HẠN BÁO CÁO SẢN LƯỢNG GCCK</b>\n" +
      "--------------------------------------\n" +
      "📌 <b>Kiểm tra:</b> " + shiftName + "\n" +
      "📅 <b>Ngày:</b> " + todayShortStr + "\n" +
      "⏰ <b>Thời điểm:</b> " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm") + "\n" +
      "--------------------------------------\n" +
      "🔴 <b>CÔNG NHÂN CHƯA NỘP BÁO CÁO (" + missingWorkers.length + " người):</b>\n";

    missingWorkers.forEach(function (w, idx) {
      messageText += (idx + 1) + ". <b>" + w + "</b>\n";
    });

    messageText += "--------------------------------------\n";
    if (MINI_APP_URL && MINI_APP_URL.trim() !== "") {
      messageText += "📲 <b>Bấm link bên dưới để nộp báo cáo ngay:</b>\n" + MINI_APP_URL.trim();
    } else {
      messageText += "👉 <i>Đề nghị công nhân truy cập Web App nộp báo cáo bổ sung ngay!</i>";
    }

    console.log(messageText);

    // Gửi cảnh báo qua Telegram Bot API
    sendTelegramMessage(messageText);

  } catch (err) {
    if (err.toString().indexOf("UrlFetchApp") !== -1 || err.toString().indexOf("permission") !== -1) {
      throw err; // Ném lỗi ra ngoài để Google Apps Script bắt buộc mở Popup Cấp Quyền (Authorization Required)!
    }
    console.log("Lỗi kiểm tra cảnh báo quá hạn: " + err.toString());
  }
}

// 🔑 HÀM KÍCH HOẠT POPUP ỦY QUYỀN GOOGLE CHO TELEGRAM
// (Nếu gặp lỗi "You do not have permission to call UrlFetchApp.fetch", hãy chọn hàm này trên menu và bấm ▶ Chạy 1 lần!)
function authorizeTelegram() {
  var url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN.trim() + "/getMe";
  var response = UrlFetchApp.fetch(url);
  Logger.log("✅ ĐÃ XÁC THỰC QUYỀN TELEGRAM THÀNH CÔNG! Phản hồi Bot: " + response.getContentText());
}

// Hàm gửi tin nhắn Telegram Bot chuẩn API
function sendTelegramMessage(htmlMessageText) {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.trim() === "" || !TELEGRAM_CHAT_ID || TELEGRAM_CHAT_ID.trim() === "") {
    console.log("⚠️ Chưa cấu hình TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID");
    return;
  }

  var url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN.trim() + "/sendMessage";
  var payload = {
    "chat_id": TELEGRAM_CHAT_ID.trim(),
    "text": htmlMessageText,
    "parse_mode": "HTML",
    "disable_web_page_preview": false
  };

  var options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  // Gọi UrlFetchApp (Để Google Apps Script tự bật Popup xin cấp quyền khi chạy)
  var response = UrlFetchApp.fetch(url, options);
  console.log("📲 Đã gửi cảnh báo Telegram thành công! Phản hồi: " + response.getContentText());
}

// ==============================================================================
// 8. HÀM TỰ ĐỘNG TẠO BỘ HẸN GIỜ (TRIGGERS) CHO 3 CA (14H15, 22H15, 06H15)
// Chạy hàm này 1 lần duy nhất trong Apps Script để kích hoạt đặt lịch!
// ==============================================================================
function setupShiftTriggers() {
  // Xóa các trigger cũ nếu có
  var existingTriggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existingTriggers.length; i++) {
    ScriptApp.deleteTrigger(existingTriggers[i]);
  }

  // Hẹn giờ Ca 1 (Sáng) - Chạy lúc 14:15 hàng ngày
  ScriptApp.newTrigger("checkShift1_14h")
    .timeBased()
    .everyDays(1)
    .atHour(14)
    .nearMinute(15)
    .create();

  // Hẹn giờ Ca 2 (Chiều) - Chạy lúc 22:15 hàng ngày
  ScriptApp.newTrigger("checkShift2_22h")
    .timeBased()
    .everyDays(1)
    .atHour(22)
    .nearMinute(15)
    .create();

  // Hẹn giờ Ca 3 (Đêm) - Chạy lúc 06:15 sáng hàng ngày
  ScriptApp.newTrigger("checkShift3_06h")
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .nearMinute(15)
    .create();

  Logger.log("✅ ĐÃ CÀI ĐẶT THÀNH CÔNG BỘ HẸN GIỜ TỰ ĐỘNG CẢNH BÁO CHO 3 CA (14H15, 22H15, 06H15)!");
}


// ==============================================================================
// 9. MENU ĐIỀU HÀNH GCCK 2026 - KHUNG SƯỜN CHUẨN 11 SHEET
// ==============================================================================
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("⚙️ Quản Lý GCCK 2026")
    .addItem("🚀 KHỞI TẠO BỘ 11 SHEET CHUẨN HÓA & TRÍCH XUẤT TỰ ĐỘNG", "setup11ChuanHoaSheets")
    .addItem("🧹 XÓA 17 SHEET MÁY LẺ CŨ (CHO GỌN BẢNG TÍNH)", "deleteOld17MachineSheets")
    .addItem("🔄 Tự Động Cập Nhật Tiến Độ & Lương Khoán", "calculateAndPopulateAllSheets")
    .addItem("⏰ Cài Đặt Bộ Hẹn Giờ Cảnh Báo 3 Ca", "setupShiftTriggers")
    .addToUi();
}

// 🧹 HÀM 1: XÓA 17 SHEET MÁY LẺ CŨ (BẢO TOÀN TUYỆT ĐỐI NHẬT KÝ SẢN LƯỢNG)
function deleteOld17MachineSheets() {
  var ss = getSpreadsheet();
  var sheetsToDelete = [
    "M01_Tien_FUJI", "M02_Tien_OKUMA", "M03_Tien_CNC1", "M04_Tien_CNC2",
    "M05_Tien_T630", "M06_Tien_T1516", "M07_Phay_OKK1", "M08_Phay_OKK2",
    "M09_Phay_OKK3", "M10_Phay_CNC1", "M11_Phay_CNC2", "M12_Phay_OIGO",
    "M13_Phay_YM", "M14_Cua_Bang", "M15_Khoan_Yoshida", "M16_CatDay_DK7745",
    "M17_CatDay_Podatech", "Tổng Đơn Hàng", "Kế Hoạch Sản Xuất", "Đơn Hàng Đang Gia Công"
  ];

  var countDeleted = 0;
  sheetsToDelete.forEach(function(sName) {
    var sh = ss.getSheetByName(sName);
    // TUYỆT ĐỐI KHÔNG XÓA "Nhật Ký Sản Lượng" VÀ "Danh Mục Master"
    if (sh && sName !== "Nhật Ký Sản Lượng" && sName !== "Danh Mục Master") {
      try {
        ss.deleteSheet(sh);
        countDeleted++;
      } catch (e) {
        console.log("Không thể xóa sheet " + sName + ": " + e.toString());
      }
    }
  });

  Logger.log("✅ Đã xóa thành công " + countDeleted + " sheet máy lẻ cũ!");
  return "Đã xóa " + countDeleted + " sheet máy lẻ cũ để làm gọn bảng tính!";
}

// 🚀 HÀM 2: KHỞI TẠO BỘ 11 SHEET CHUẨN HÓA TRÍCH XUẤT TRỰC TIẾP TỪ 'Nhật Ký Sản Lượng'
var STANDARDIZED_SHEETS_DATA = {
  "01_Tong_Quan_Dashboard": [
    [
      "BẢNG ĐIỀU HÀNH TỔNG THỂ & CHỈ SỐ HOẠT ĐỘNG TOÀN DIỆN (EXECUTIVE DASHBOARD)"
    ],
    [
      "Nhà máy Đúc Thép Hợp Kim & Cơ Khí Chính Xác | Giám sát trực quan: Tiến độ PO, Cân bằng tải máy, Điểm nghẽn, Chất lượng & Chi phí"
    ],
    [],
    [
      "",
      "TỔNG LỆNH SX (PO)",
      "",
      "TỔNG BTP ĐÃ XONG",
      "",
      "BTP TỒN CHỜ BÀN GIAO (WIP)",
      "",
      "MÁY NGHẼN QUÁ TẢI (>120%)",
      "",
      "PO ĐỀ XUẤT THUÊ NGOÀI",
      "",
      "TỶ LỆ PHẾ PHẨM (SCRAP RATE)"
    ],
    [
      "",
      "=COUNTA('06_Ke_Hoach_Tien_Do_PO'!B4:B500)",
      "",
      "=SUM('06_Ke_Hoach_Tien_Do_PO'!F4:F500)",
      "",
      "=SUM('06_Ke_Hoach_Tien_Do_PO'!H4:H500)",
      "",
      "=COUNTIF('03_Can_Bang_Tai_17_May'!H4:H25, \"NGHẼN NẶNG\")",
      "",
      "=COUNTIF('02_Canh_Bao_Qua_Tai_SubCon'!L8:L100, \"ĐỀ XUẤT GIA CÔNG NGOÀI\")",
      "",
      "=SUM('08_Kiem_Soat_Chat_Luong_QA'!I4:I100)/(SUM('06_Ke_Hoach_Tien_Do_PO'!E4:E500)+1)"
    ],
    [],
    [
      "1. TỔNG HỢP TIẾN ĐỘ & BÀN GIAO THEO ĐỐI TÁC KHÁCH HÀNG"
    ],
    [
      "STT",
      "Khách Hàng",
      "Mặt Hàng Chủ Lực",
      "Số Lượng PO",
      "Tổng SL Đặt",
      "Xong Tại Xưởng",
      "Đã Bàn Giao",
      "Tồn Chờ Bàn Giao",
      "Còn Nợ PO",
      "Tiến Độ Bàn Giao (%)",
      "Trạng Thái Điều Hành",
      "Bộ Phận Tiếp Nhận Tiếp Theo"
    ],
    [
      "1",
      "Thyssen",
      "Sealing strip, below / above (Thép hợp kim chịu mòn)",
      "=COUNTIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B9)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B9, '06_Ke_Hoach_Tien_Do_PO'!$E$4:$E$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B9, '06_Ke_Hoach_Tien_Do_PO'!$F$4:$F$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B9, '06_Ke_Hoach_Tien_Do_PO'!$G$4:$G$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B9, '06_Ke_Hoach_Tien_Do_PO'!$H$4:$H$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B9, '06_Ke_Hoach_Tien_Do_PO'!$I$4:$I$500)",
      "=IF(E9=0, 0, G9/E9)",
      "=IF(G9>=E9, \"Đã chuyển đủ 100%\", IF(F9>=E9, \"Xong xưởng - Chờ chuyển\", IF(F9>0, \"Đang chạy trên máy\", \"Chờ nhận phôi đúc\")))",
      "Bộ phận Hoàn thiện (Tẩy bavia/Đóng kiện)"
    ],
    [
      "2",
      "Win-Win",
      "Cánh xoắn đùn ISHIZUE (355Dw900, 318Dw800, 216Dw650...)",
      "=COUNTIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B10)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B10, '06_Ke_Hoach_Tien_Do_PO'!$E$4:$E$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B10, '06_Ke_Hoach_Tien_Do_PO'!$F$4:$F$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B10, '06_Ke_Hoach_Tien_Do_PO'!$G$4:$G$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B10, '06_Ke_Hoach_Tien_Do_PO'!$H$4:$H$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B10, '06_Ke_Hoach_Tien_Do_PO'!$I$4:$I$500)",
      "=IF(E10=0, 0, G10/E10)",
      "=IF(G10>=E10, \"Đã chuyển đủ 100%\", IF(F10>=E10, \"Xong xưởng - Chờ chuyển\", IF(F10>0, \"Đang chạy trên máy\", \"Chờ nhận phôi đúc\")))",
      "Bộ phận Hoàn thiện (Lắp cụm trục)"
    ],
    [
      "3",
      "Vico- QLTB",
      "Mẫu thử cơ tính CR, Mẫu kéo nén ASTM",
      "=COUNTIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B11)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B11, '06_Ke_Hoach_Tien_Do_PO'!$E$4:$E$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B11, '06_Ke_Hoach_Tien_Do_PO'!$F$4:$F$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B11, '06_Ke_Hoach_Tien_Do_PO'!$G$4:$G$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B11, '06_Ke_Hoach_Tien_Do_PO'!$H$4:$H$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B11, '06_Ke_Hoach_Tien_Do_PO'!$I$4:$I$500)",
      "=IF(E11=0, 0, G11/E11)",
      "=IF(G11>=E11, \"Đã chuyển đủ 100%\", IF(F11>=E11, \"Xong xưởng - Chờ chuyển\", IF(F11>0, \"Đang chạy trên máy\", \"Chờ nhận phôi đúc\")))",
      "Phòng KCS / Thử nghiệm ASTM"
    ],
    [
      "4",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái / bên phải)",
      "=COUNTIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B12)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B12, '06_Ke_Hoach_Tien_Do_PO'!$E$4:$E$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B12, '06_Ke_Hoach_Tien_Do_PO'!$F$4:$F$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B12, '06_Ke_Hoach_Tien_Do_PO'!$G$4:$G$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B12, '06_Ke_Hoach_Tien_Do_PO'!$H$4:$H$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B12, '06_Ke_Hoach_Tien_Do_PO'!$I$4:$I$500)",
      "=IF(E12=0, 0, G12/E12)",
      "=IF(G12>=E12, \"Đã chuyển đủ 100%\", IF(F12>=E12, \"Xong xưởng - Chờ chuyển\", IF(F12>0, \"Đang chạy trên máy\", \"Chờ nhận phôi đúc\")))",
      "Bộ phận Hoàn thiện"
    ],
    [
      "5",
      "Molycop",
      "Bi đúc hợp kim cắt dây & mài từ",
      "=COUNTIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B13)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B13, '06_Ke_Hoach_Tien_Do_PO'!$E$4:$E$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B13, '06_Ke_Hoach_Tien_Do_PO'!$F$4:$F$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B13, '06_Ke_Hoach_Tien_Do_PO'!$G$4:$G$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B13, '06_Ke_Hoach_Tien_Do_PO'!$H$4:$H$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B13, '06_Ke_Hoach_Tien_Do_PO'!$I$4:$I$500)",
      "=IF(E13=0, 0, G13/E13)",
      "=IF(G13>=E13, \"Đã chuyển đủ 100%\", IF(F13>=E13, \"Xong xưởng - Chờ chuyển\", IF(F13>0, \"Đang chạy trên máy\", \"Chờ nhận phôi đúc\")))",
      "PX Nhiệt luyện / Phòng KCS"
    ],
    [
      "6",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145 - Thép Mn13)",
      "=COUNTIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B14)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B14, '06_Ke_Hoach_Tien_Do_PO'!$E$4:$E$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B14, '06_Ke_Hoach_Tien_Do_PO'!$F$4:$F$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B14, '06_Ke_Hoach_Tien_Do_PO'!$G$4:$G$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B14, '06_Ke_Hoach_Tien_Do_PO'!$H$4:$H$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B14, '06_Ke_Hoach_Tien_Do_PO'!$I$4:$I$500)",
      "=IF(E14=0, 0, G14/E14)",
      "=IF(G14>=E14, \"Đã chuyển đủ 100%\", IF(F14>=E14, \"Xong xưởng - Chờ chuyển\", IF(F14>0, \"Đang chạy trên máy\", \"Chờ nhận phôi đúc\")))",
      "PX Nhiệt luyện (Tôi cao tần)"
    ],
    [
      "7",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền: Thân rô to (φ820x890), Bích rulo",
      "=COUNTIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B15)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B15, '06_Ke_Hoach_Tien_Do_PO'!$E$4:$E$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B15, '06_Ke_Hoach_Tien_Do_PO'!$F$4:$F$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B15, '06_Ke_Hoach_Tien_Do_PO'!$G$4:$G$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B15, '06_Ke_Hoach_Tien_Do_PO'!$H$4:$H$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B15, '06_Ke_Hoach_Tien_Do_PO'!$I$4:$I$500)",
      "=IF(E15=0, 0, G15/E15)",
      "=IF(G15>=E15, \"Đã chuyển đủ 100%\", IF(F15>=E15, \"Xong xưởng - Chờ chuyển\", IF(F15>0, \"Đang chạy trên máy\", \"Chờ nhận phôi đúc\")))",
      "Tổ Lắp Ráp & Hoàn Thiện"
    ],
    [
      "8",
      "TFG",
      "Nut cover F3P00064, Chi tiết bản vẽ 2CG00820",
      "=COUNTIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B16)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B16, '06_Ke_Hoach_Tien_Do_PO'!$E$4:$E$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B16, '06_Ke_Hoach_Tien_Do_PO'!$F$4:$F$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B16, '06_Ke_Hoach_Tien_Do_PO'!$G$4:$G$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B16, '06_Ke_Hoach_Tien_Do_PO'!$H$4:$H$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B16, '06_Ke_Hoach_Tien_Do_PO'!$I$4:$I$500)",
      "=IF(E16=0, 0, G16/E16)",
      "=IF(G16>=E16, \"Đã chuyển đủ 100%\", IF(F16>=E16, \"Xong xưởng - Chờ chuyển\", IF(F16>0, \"Đang chạy trên máy\", \"Chờ nhận phôi đúc\")))",
      "Bộ phận Hoàn thiện"
    ],
    [
      "9",
      "UCC",
      "Khuôn gá xích POWER, Bạc lót 4-210658-2",
      "=COUNTIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B17)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B17, '06_Ke_Hoach_Tien_Do_PO'!$E$4:$E$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B17, '06_Ke_Hoach_Tien_Do_PO'!$F$4:$F$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B17, '06_Ke_Hoach_Tien_Do_PO'!$G$4:$G$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B17, '06_Ke_Hoach_Tien_Do_PO'!$H$4:$H$500)",
      "=SUMIF('06_Ke_Hoach_Tien_Do_PO'!$C$4:$C$500, B17, '06_Ke_Hoach_Tien_Do_PO'!$I$4:$I$500)",
      "=IF(E17=0, 0, G17/E17)",
      "=IF(G17>=E17, \"Đã chuyển đủ 100%\", IF(F17>=E17, \"Xong xưởng - Chờ chuyển\", IF(F17>0, \"Đang chạy trên máy\", \"Chờ nhận phôi đúc\")))",
      "PX Nhiệt luyện (Tôi chân không)"
    ],
    [
      "TỔNG CỘNG TOÀN NHÀ MÁY",
      "",
      "",
      "=SUM(D9:D17)",
      "=SUM(E9:E17)",
      "=SUM(F9:F17)",
      "=SUM(G9:G17)",
      "=SUM(H9:H17)",
      "=SUM(I9:I17)",
      "=IF(E18=0, 0, G18/E18)",
      "-",
      "-"
    ]
  ],
  "02_Canh_Bao_Qua_Tai_SubCon": [
    [
      "HỆ THỐNG CẢNH BÁO ĐƠN HÀNG QUÁ TẢI & ĐỀ XUẤT ĐIỀU CHUYỂN GIA CÔNG NGOÀI (SUB-CON)"
    ],
    [
      "Phân xưởng Cơ khí | Tự động đối soát Tổng giờ công nghệ yêu cầu vs Năng lực máy thực tế -> Cảnh báo Trễ hạn -> Đề xuất chuyển gia công ngoài an toàn"
    ],
    [],
    [
      "STT",
      "Mã PO / LSX",
      "Khách Hàng",
      "Tên Chi Tiết / Quy Cách",
      "SL Cần Làm",
      "Máy Nghẽn Phụ Trách",
      "Tổng Giờ Cần Chạy (h)",
      "Số Ngày Còn Lại (Deadline)",
      "Khả Năng Xưởng Tự Làm (Chi tiết)",
      "SL ĐỀ XUẤT CHUYỂN NGOÀI",
      "Trần Giá Thuê Ngoài / CT (VNĐ)",
      "LỆNH ĐIỀU HÀNH SẢN XUẤT",
      "Đơn Vị Vệ Tinh Đề Xuất",
      "Phương Án Kiểm Soát Rủi Ro"
    ],
    [
      "1",
      "PO-5999",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 355Dw900",
      "50",
      "Máy tiện FUJI",
      "150",
      "5",
      "20",
      "=MAX(0, E5-I5)",
      "420000",
      "=IF(J5>0, \"ĐỀ XUẤT GIA CÔNG NGOÀI\", IF(G5>H5*12, \"TĂNG CA NỘI BỘ GẤP\", \"CHẠY NỘI BỘ AN TOÀN\"))",
      "Xưởng cơ khí Hoàng Mai",
      "Chuyển NC1 gọt thô ra ngoài, giữ NC3 tiện tinh tại xưởng"
    ],
    [
      "2",
      "PO-3733",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 318Dw800",
      "60",
      "Máy tiện FUJI",
      "150",
      "4",
      "15",
      "=MAX(0, E6-I6)",
      "320000",
      "=IF(J6>0, \"ĐỀ XUẤT GIA CÔNG NGOÀI\", IF(G6>H6*12, \"TĂNG CA NỘI BỘ GẤP\", \"CHẠY NỘI BỘ AN TOÀN\"))",
      "Công ty Cơ khí Tân Phát",
      "Cung cấp phôi và đồ gá chuẩn, KCS nghiệm thu tại xưởng vệ tinh"
    ],
    [
      "3",
      "PO-7365",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145)",
      "8",
      "Máy Phay OIGO",
      "80",
      "3",
      "3",
      "=MAX(0, E7-I7)",
      "1400000",
      "=IF(J7>0, \"ĐỀ XUẤT GIA CÔNG NGOÀI\", IF(G7>H7*12, \"TĂNG CA NỘI BỘ GẤP\", \"CHẠY NỘI BỘ AN TOÀN\"))",
      "Xưởng Phay Giường Đức Long",
      "Gia công ngoài NC1 phay mặt, xưởng giữ lại phay rãnh & tôi cao tần"
    ],
    [
      "4",
      "PO-5313",
      "Thyssen",
      "Sealing trip, below",
      "120",
      "Máy Phay OKK1",
      "100",
      "10",
      "120",
      "=MAX(0, E8-I8)",
      "85000",
      "=IF(J8>0, \"ĐỀ XUẤT GIA CÔNG NGOÀI\", IF(G8>H8*12, \"TĂNG CA NỘI BỘ GẤP\", \"CHẠY NỘI BỘ AN TOÀN\"))",
      "-",
      "Xưởng đủ năng lực hoàn thành đúng hạn (Nội bộ)"
    ],
    [
      "5",
      "PO-7107",
      "Thyssen",
      "Sealing strip, above",
      "100",
      "Máy Phay OKK3",
      "75",
      "8",
      "100",
      "=MAX(0, E9-I9)",
      "95000",
      "=IF(J9>0, \"ĐỀ XUẤT GIA CÔNG NGOÀI\", IF(G9>H9*12, \"TĂNG CA NỘI BỘ GẤP\", \"CHẠY NỘI BỘ AN TOÀN\"))",
      "-",
      "Chạy nội bộ 2 ca đảm bảo tiến độ"
    ],
    [
      "6",
      "PO-4545",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "40",
      "Máy Cắt Dây DK7745",
      "100",
      "4",
      "16",
      "=MAX(0, E10-I10)",
      "140000",
      "=IF(J10>0, \"ĐỀ XUẤT GIA CÔNG NGOÀI\", IF(G10>H10*12, \"TĂNG CA NỘI BỘ GẤP\", \"CHẠY NỘI BỘ AN TOÀN\"))",
      "Cắt dây CNC Nam Định",
      "Gửi file CAD/CAM cắt dây theo dưỡng kiểm"
    ],
    [
      "7",
      "PO-8205",
      "Molycop",
      "Bi 40",
      "80",
      "Máy Cắt Dây DK7745",
      "40",
      "7",
      "80",
      "=MAX(0, E11-I11)",
      "65000",
      "=IF(J11>0, \"ĐỀ XUẤT GIA CÔNG NGOÀI\", IF(G11>H11*12, \"TĂNG CA NỘI BỘ GẤP\", \"CHẠY NỘI BỘ AN TOÀN\"))",
      "-",
      "Xưởng chạy đêm bù tải, không cần thuê ngoài"
    ],
    [
      "8",
      "PO-1456",
      "UCC",
      "Khuôn gá xích POWER",
      "30",
      "Máy Phay CNC1",
      "60",
      "3",
      "10",
      "=MAX(0, E12-I12)",
      "350000",
      "=IF(J12>0, \"ĐỀ XUẤT GIA CÔNG NGOÀI\", IF(G12>H12*12, \"TĂNG CA NỘI BỘ GẤP\", \"CHẠY NỘI BỘ AN TOÀN\"))",
      "Cơ khí Chính xác An Phát",
      "Thuê ngoài phay thô, đưa về nhiệt luyện và mài tinh tại xưởng"
    ]
  ],
  "03_Can_Bang_Tai_17_May": [
    [
      "BẢNG PHÂN TÍCH CÂN BẰNG TẢI THIẾT BỊ & NĂNG LỰC SẢN XUẤT XƯỞNG"
    ],
    [
      "Nhà máy Cơ khí | Theo dõi Năng lực khả dụng (h/tuần) vs Nhu cầu giờ công nghệ (h/tuần) -> Phát hiện điểm nghẽn (Bottleneck)"
    ],
    [
      "STT",
      "Tên Thiết Bị / Máy Gia Công",
      "Nhóm Công Nghệ",
      "Số Ca Làm Việc / Ngày",
      "Năng Lực Khả Dụng (Giờ/Tuần)",
      "Nhu Cầu Giờ Cần Chạy (Giờ)",
      "Hệ Số Tải Máy (%)",
      "Đánh Giá Trạng Thái Tải",
      "Số Giờ Bị Thiếu Hụt (h)",
      "Máy Thay Thế Dự Phòng (San Tải)",
      "Khả Năng Chuyển Máy Nội Bộ (%)",
      "Đề Xuất Hành Động Quản Đốc",
      "Ghi Chú Kỹ Thuật"
    ],
    [
      "1",
      "Máy tiện FUJI",
      "Tiện CNC hạng vừa",
      "2",
      "96",
      "158",
      "=F4/E4",
      "=IF(G4>1.2, \"NGHẼN NẶNG\", IF(G4>=1.0, \"CẢNH BÁO QUÁ TẢI\", IF(G4>=0.75, \"TẢI TỐI ƯU\", \"DƯ NĂNG LỰC\")))",
      "=MAX(0, F4-E4)",
      "Máy tiện OKUMA / CNC1",
      "0.4",
      "San bớt 40% sang OKUMA, còn lại 60h chuyển thuê ngoài"
    ],
    [
      "2",
      "Máy Phay OKK3",
      "Phay CNC 3 trục",
      "2",
      "96",
      "122",
      "=F5/E5",
      "=IF(G5>1.2, \"NGHẼN NẶNG\", IF(G5>=1.0, \"CẢNH BÁO QUÁ TẢI\", IF(G5>=0.75, \"TẢI TỐI ƯU\", \"DƯ NĂNG LỰC\")))",
      "=MAX(0, F5-E5)",
      "Máy Phay OKK1 / OKK2",
      "0.5",
      "San bớt chi tiết phay mặt sang OKK1, OKK2"
    ],
    [
      "3",
      "Máy Phay OIGO",
      "Phay giường hạng nặng",
      "2",
      "96",
      "145",
      "=F6/E6",
      "=IF(G6>1.2, \"NGHẼN NẶNG\", IF(G6>=1.0, \"CẢNH BÁO QUÁ TẢI\", IF(G6>=0.75, \"TẢI TỐI ƯU\", \"DƯ NĂNG LỰC\")))",
      "=MAX(0, F6-E6)",
      "Không có máy nội bộ tương đương",
      "0",
      "BẮT BUỘC thuê ngoài NC1 phay thô hoặc chạy ca 3"
    ],
    [
      "4",
      "Máy Cắt Dây DK7745",
      "Cắt dây CNC",
      "2.5",
      "120",
      "140",
      "=F7/E7",
      "=IF(G7>1.2, \"NGHẼN NẶNG\", IF(G7>=1.0, \"CẢNH BÁO QUÁ TẢI\", IF(G7>=0.75, \"TẢI TỐI ƯU\", \"DƯ NĂNG LỰC\")))",
      "=MAX(0, F7-E7)",
      "Máy Cắt Dây DK7780 / Podatech",
      "0.5",
      "Chuyển việc sang DK7780 và vệ tinh cắt dây Nam Định"
    ],
    [
      "5",
      "Máy tiện OKUMA",
      "Tiện CNC chính xác",
      "2",
      "96",
      "82",
      "=F8/E8",
      "=IF(G8>1.2, \"NGHẼN NẶNG\", IF(G8>=1.0, \"CẢNH BÁO QUÁ TẢI\", IF(G8>=0.75, \"TẢI TỐI ƯU\", \"DƯ NĂNG LỰC\")))",
      "=MAX(0, F8-E8)",
      "Sẵn sàng nhận tải bù từ FUJI",
      "1",
      "Đang tải tối ưu (85%), sẵn sàng nhận bù việc"
    ],
    [
      "6",
      "Máy Phay OKK1",
      "Phay CNC",
      "2",
      "96",
      "88",
      "=F9/E9",
      "=IF(G9>1.2, \"NGHẼN NẶNG\", IF(G9>=1.0, \"CẢNH BÁO QUÁ TẢI\", IF(G9>=0.75, \"TẢI TỐI ƯU\", \"DƯ NĂNG LỰC\")))",
      "=MAX(0, F9-E9)",
      "Sẵn sàng nhận việc từ OKK3",
      "1",
      "Tải tối ưu (92%)"
    ],
    [
      "7",
      "Máy Phay OKK2",
      "Phay CNC",
      "2",
      "96",
      "75",
      "=F10/E10",
      "=IF(G10>1.2, \"NGHẼN NẶNG\", IF(G10>=1.0, \"CẢNH BÁO QUÁ TẢI\", IF(G10>=0.75, \"TẢI TỐI ƯU\", \"DƯ NĂNG LỰC\")))",
      "=MAX(0, F10-E10)",
      "Sẵn sàng nhận việc từ OKK3",
      "1",
      "Tải 78%, còn dư năng lực"
    ],
    [
      "8",
      "Máy Phay CNC1",
      "Phay CNC",
      "2",
      "96",
      "70",
      "=F11/E11",
      "=IF(G11>1.2, \"NGHẼN NẶNG\", IF(G11>=1.0, \"CẢNH BÁO QUÁ TẢI\", IF(G11>=0.75, \"TẢI TỐI ƯU\", \"DƯ NĂNG LỰC\")))",
      "=MAX(0, F11-E11)",
      "Sẵn sàng san tải",
      "1",
      "Tải 73%"
    ],
    [
      "9",
      "Máy Phay CNC2",
      "Phay CNC",
      "2",
      "96",
      "68",
      "=F12/E12",
      "=IF(G12>1.2, \"NGHẼN NẶNG\", IF(G12>=1.0, \"CẢNH BÁO QUÁ TẢI\", IF(G12>=0.75, \"TẢI TỐI ƯU\", \"DƯ NĂNG LỰC\")))",
      "=MAX(0, F12-E12)",
      "Sẵn sàng san tải",
      "1",
      "Tải 71%"
    ],
    [
      "10",
      "Máy Cắt Dây DK7780",
      "Cắt dây CNC khổ lớn",
      "2",
      "96",
      "65",
      "=F13/E13",
      "=IF(G13>1.2, \"NGHẼN NẶNG\", IF(G13>=1.0, \"CẢNH BÁO QUÁ TẢI\", IF(G13>=0.75, \"TẢI TỐI ƯU\", \"DƯ NĂNG LỰC\")))",
      "=MAX(0, F13-E13)",
      "Nhận việc từ DK7745",
      "1",
      "Tải 68%"
    ],
    [
      "11",
      "Máy Cắt Dây Podatech",
      "Cắt dây CNC",
      "2",
      "96",
      "55",
      "=F14/E14",
      "=IF(G14>1.2, \"NGHẼN NẶNG\", IF(G14>=1.0, \"CẢNH BÁO QUÁ TẢI\", IF(G14>=0.75, \"TẢI TỐI ƯU\", \"DƯ NĂNG LỰC\")))",
      "=MAX(0, F14-E14)",
      "Nhận việc từ DK7745",
      "1",
      "Tải 57%"
    ],
    [
      "12",
      "Máy Khoan cần Yoshida",
      "Khoan / Taro",
      "2",
      "96",
      "92",
      "=F15/E15",
      "=IF(G15>1.2, \"NGHẼN NẶNG\", IF(G15>=1.0, \"CẢNH BÁO QUÁ TẢI\", IF(G15>=0.75, \"TẢI TỐI ƯU\", \"DƯ NĂNG LỰC\")))",
      "=MAX(0, F15-E15)",
      "Gia công nội bộ ổn định",
      "1",
      "Tải 96% - Bình thường"
    ],
    [
      "13",
      "Máy tiện Tiện T1516",
      "Tiện đứng hạng nặng",
      "2",
      "96",
      "85",
      "=F16/E16",
      "=IF(G16>1.2, \"NGHẼN NẶNG\", IF(G16>=1.0, \"CẢNH BÁO QUÁ TẢI\", IF(G16>=0.75, \"TẢI TỐI ƯU\", \"DƯ NĂNG LỰC\")))",
      "=MAX(0, F16-E16)",
      "Chạy thân rô to & bích",
      "1",
      "Tải 89%"
    ],
    [
      "14",
      "Máy tiện Tiện T1517",
      "Tiện đứng hạng nặng",
      "2",
      "96",
      "70",
      "=F17/E17",
      "=IF(G17>1.2, \"NGHẼN NẶNG\", IF(G17>=1.0, \"CẢNH BÁO QUÁ TẢI\", IF(G17>=0.75, \"TẢI TỐI ƯU\", \"DƯ NĂNG LỰC\")))",
      "=MAX(0, F17-E17)",
      "Chạy rô to",
      "1",
      "Tải 73%"
    ],
    [
      "15",
      "Máy tiện Tiện T1522",
      "Tiện đứng hạng nặng",
      "2",
      "96",
      "45",
      "=F18/E18",
      "=IF(G18>1.2, \"NGHẼN NẶNG\", IF(G18>=1.0, \"CẢNH BÁO QUÁ TẢI\", IF(G18>=0.75, \"TẢI TỐI ƯU\", \"DƯ NĂNG LỰC\")))",
      "=MAX(0, F18-E18)",
      "Phay mặt rô to",
      "1",
      "Tải 47%"
    ],
    [
      "16",
      "Máy tiện CNC1",
      "Tiện CNC",
      "2",
      "96",
      "50",
      "=F19/E19",
      "=IF(G19>1.2, \"NGHẼN NẶNG\", IF(G19>=1.0, \"CẢNH BÁO QUÁ TẢI\", IF(G19>=0.75, \"TẢI TỐI ƯU\", \"DƯ NĂNG LỰC\")))",
      "=MAX(0, F19-E19)",
      "Nhận tải từ FUJI",
      "1",
      "Tải 52%"
    ],
    [
      "17",
      "Máy tiện T630",
      "Tiện vạn năng",
      "1",
      "48",
      "25",
      "=F20/E20",
      "=IF(G20>1.2, \"NGHẼN NẶNG\", IF(G20>=1.0, \"CẢNH BÁO QUÁ TẢI\", IF(G20>=0.75, \"TẢI TỐI ƯU\", \"DƯ NĂNG LỰC\")))",
      "=MAX(0, F20-E20)",
      "Hỗ trợ sửa khuôn/gá",
      "1",
      "Tải 52%"
    ]
  ],
  "04_Bao_Gia_Gia_Thanh_SP": [
    [
      "BẢNG TÍNH THÀNH PHẨM, TỔNG HỢP GIÁ THÀNH GIA CÔNG & BÁO GIÁ SẢN PHẨM"
    ],
    [
      "Nhà máy Đúc Thép Hợp Kim & Cơ Khí Chính Xác | Cơ cấu giá: Phôi đúc + Khoán thợ + Dao cụ tiêu hao + Giờ máy + Chi phí quản lý chung + Lợi nhuận kỳ vọng"
    ],
    [
      "STT",
      "Khách Hàng",
      "Tên / Quy Cách Sản Phẩm Đúc",
      "Mác Thép Hợp Kim",
      "Khối Lượng Phôi (kg)",
      "Đơn Giá Thép Đúc (VNĐ/kg)",
      "Tiền Phôi Đúc (VNĐ)",
      "Tổng Tiền Khoán Thợ (VNĐ)",
      "Tổng Chi Phí Dao Cụ (VNĐ)",
      "Tổng Chi Phí Giờ Máy (VNĐ)",
      "GIÁ THÀNH SẢN XUẤT (VNĐ)",
      "Chi Phí QL & Nhiệt Luyện (15%)",
      "GIÁ THÀNH TOÀN BỘ (VNĐ)",
      "Lợi Nhuận Kỳ Vọng (18%)",
      "ĐƠN GIÁ BÁO GIÁ CHÀO KHÁCH (VNĐ)",
      "Ghi Chú Đơn Hàng"
    ],
    [
      "1",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145)",
      "Thép Mangan Mn13",
      "1250",
      "48000",
      "=E4*F4",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C4, '05_Dinh_Muc_Khoan_Routing'!$N$4:$N$100)",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C4, '05_Dinh_Muc_Khoan_Routing'!$M$4:$M$100)",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C4, '05_Dinh_Muc_Khoan_Routing'!$P$4:$P$100)",
      "=G4+H4+I4+J4",
      "=K4*0.15",
      "=K4+L4",
      "=M4*0.18",
      "=M4+N4",
      "Hàng chịu mài mòn va đập mạnh"
    ],
    [
      "2",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "Thép hợp kim 35CrMo",
      "3600",
      "52000",
      "=E5*F5",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C5, '05_Dinh_Muc_Khoan_Routing'!$N$4:$N$100)",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C5, '05_Dinh_Muc_Khoan_Routing'!$M$4:$M$100)",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C5, '05_Dinh_Muc_Khoan_Routing'!$P$4:$P$100)",
      "=G5+H5+I5+J5",
      "=K5*0.15",
      "=K5+L5",
      "=M5*0.18",
      "=M5+N5",
      "Rô to nghiền sơ cấp nặng"
    ],
    [
      "3",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Bích rulo (φ500x110) 1T",
      "Thép đúc ZG35",
      "180",
      "42000",
      "=E6*F6",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C6, '05_Dinh_Muc_Khoan_Routing'!$N$4:$N$100)",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C6, '05_Dinh_Muc_Khoan_Routing'!$M$4:$M$100)",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C6, '05_Dinh_Muc_Khoan_Routing'!$P$4:$P$100)",
      "=G6+H6+I6+J6",
      "=K6*0.15",
      "=K6+L6",
      "=M6*0.18",
      "=M6+N6",
      "Bích đỡ rulo"
    ],
    [
      "4",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 355Dw900",
      "Thép đúc chịu mòn Cr-Ni",
      "280",
      "55000",
      "=E7*F7",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C7, '05_Dinh_Muc_Khoan_Routing'!$N$4:$N$100)",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C7, '05_Dinh_Muc_Khoan_Routing'!$M$4:$M$100)",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C7, '05_Dinh_Muc_Khoan_Routing'!$P$4:$P$100)",
      "=G7+H7+I7+J7",
      "=K7*0.15",
      "=K7+L7",
      "=M7*0.18",
      "=M7+N7",
      "Vít đùn công nghiệp"
    ],
    [
      "5",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 114Dw300",
      "Thép đúc hợp kim Cr",
      "65",
      "52000",
      "=E8*F8",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C8, '05_Dinh_Muc_Khoan_Routing'!$N$4:$N$100)",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C8, '05_Dinh_Muc_Khoan_Routing'!$M$4:$M$100)",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C8, '05_Dinh_Muc_Khoan_Routing'!$P$4:$P$100)",
      "=G8+H8+I8+J8",
      "=K8*0.15",
      "=K8+L8",
      "=M8*0.18",
      "=M8+N8",
      "Vít đùn cỡ nhỏ"
    ],
    [
      "6",
      "Thyssen",
      "Sealing strip, below",
      "Thép hợp kim chống mòn",
      "45",
      "62000",
      "=E9*F9",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C9, '05_Dinh_Muc_Khoan_Routing'!$N$4:$N$100)",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C9, '05_Dinh_Muc_Khoan_Routing'!$M$4:$M$100)",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C9, '05_Dinh_Muc_Khoan_Routing'!$P$4:$P$100)",
      "=G9+H9+I9+J9",
      "=K9*0.15",
      "=K9+L9",
      "=M9*0.18",
      "=M9+N9",
      "Thanh làm kín xỉ"
    ],
    [
      "7",
      "Thyssen",
      "Sealing strip, above",
      "Thép hợp kim chống mòn",
      "48",
      "62000",
      "=E10*F10",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C10, '05_Dinh_Muc_Khoan_Routing'!$N$4:$N$100)",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C10, '05_Dinh_Muc_Khoan_Routing'!$M$4:$M$100)",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C10, '05_Dinh_Muc_Khoan_Routing'!$P$4:$P$100)",
      "=G10+H10+I10+J10",
      "=K10*0.15",
      "=K10+L10",
      "=M10*0.18",
      "=M10+N10",
      "Thanh làm kín trên"
    ],
    [
      "8",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "Thép đúc va đập cao",
      "120",
      "50000",
      "=E11*F11",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C11, '05_Dinh_Muc_Khoan_Routing'!$N$4:$N$100)",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C11, '05_Dinh_Muc_Khoan_Routing'!$M$4:$M$100)",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C11, '05_Dinh_Muc_Khoan_Routing'!$P$4:$P$100)",
      "=G11+H11+I11+J11",
      "=K11*0.15",
      "=K11+L11",
      "=M11*0.18",
      "=M11+N11",
      "Ốp đầu dao nhào"
    ],
    [
      "9",
      "UCC",
      "Khuôn gá xích POWER",
      "Thép hợp kim Cr12MoV",
      "85",
      "75000",
      "=E12*F12",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C12, '05_Dinh_Muc_Khoan_Routing'!$N$4:$N$100)",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C12, '05_Dinh_Muc_Khoan_Routing'!$M$4:$M$100)",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C12, '05_Dinh_Muc_Khoan_Routing'!$P$4:$P$100)",
      "=G12+H12+I12+J12",
      "=K12*0.15",
      "=K12+L12",
      "=M12*0.18",
      "=M12+N12",
      "Khuôn dập xích"
    ],
    [
      "10",
      "Vico- QLTB",
      "Mẫu Thử CR & hàng #",
      "Thép đúc mẫu ASTM",
      "15",
      "60000",
      "=E13*F13",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C13, '05_Dinh_Muc_Khoan_Routing'!$N$4:$N$100)",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C13, '05_Dinh_Muc_Khoan_Routing'!$M$4:$M$100)",
      "=SUMIF('05_Dinh_Muc_Khoan_Routing'!$C$4:$C$100, C13, '05_Dinh_Muc_Khoan_Routing'!$P$4:$P$100)",
      "=G13+H13+I13+J13",
      "=K13*0.15",
      "=K13+L13",
      "=M13*0.18",
      "=M13+N13",
      "Mẫu kiểm định cơ tính"
    ]
  ],
  "05_Dinh_Muc_Khoan_Routing": [
    [
      "BẢNG ĐỊNH MỨC CÔNG NGHỆ, MỨC KHOÁN THEO TỪNG NGUYÊN CÔNG & TIÊU HAO DAO CỤ"
    ],
    [
      "Phân xưởng Cơ khí | Bấm giờ định mức (phút/giờ) - Chọn máy phù hợp - Định mức dao cụ (lưỡi cắt) - Mức khoán công nhân (VNĐ/chi tiết)"
    ],
    [
      "STT",
      "Khách Hàng",
      "Tên Sản Phẩm Đúc",
      "Thứ Tự NC",
      "Nội Dung Nguyên Công Gia Công",
      "Máy Gia Công Chỉ Định",
      "Định Mức Giờ (h)",
      "Định Mức Phút (p)",
      "Chủng Loại Dụng Cụ Cắt",
      "Số Lưỡi Cắt / Mảnh",
      "Tuổi Thọ (Chi Tiết / Lưỡi)",
      "Đơn Giá Mảnh Dao (VNĐ)",
      "Chi Phí Dao / Chi Tiết (VNĐ)",
      "MỨC KHOÁN THỢ (VNĐ/CT)",
      "Đơn Giá Giờ Máy (VNĐ/h)",
      "Chi Phí Máy / Chi Tiết (VNĐ)",
      "TỔNG CHI PHÍ NGUYÊN CÔNG (VNĐ)"
    ],
    [
      "1",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145)",
      "NC1",
      "G/c phay thô phá vỏ đúc & bán tinh mặt phẳng Kt 445/145mm",
      "Máy Phay OIGO",
      "=H4/60",
      "360",
      "Đài phay chíp tròn R6 phủ CVD va đập",
      "4",
      "0.5",
      "180000",
      "=(L4/J4)/K4",
      "1562400",
      "280000",
      "=G4*O4",
      "=M4+N4+P4"
    ],
    [
      "2",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145)",
      "NC2",
      "G/c phay hoàn thiện rãnh 62/52mm & bo mép R",
      "Máy Phay OIGO",
      "=H5/60",
      "240",
      "Dao phay gắn mảnh CBN chịu nhiệt",
      "2",
      "0.25",
      "450000",
      "=(L5/J5)/K5",
      "892800",
      "280000",
      "=G5*O5",
      "=M5+N5+P5"
    ],
    [
      "3",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "NC1",
      "G/c tiện khỏa mặt đầu L=690mm (Mặt 1 & 2)",
      "Máy tiện Tiện T1516",
      "=H6/60",
      "180",
      "Dao tiện thô WNMG 080408 cán vuông 32",
      "6",
      "1",
      "120000",
      "=(L6/J6)/K6",
      "350000",
      "320000",
      "=G6*O6",
      "=M6+N6+P6"
    ],
    [
      "4",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "NC2",
      "G/c tiện thô & bán tinh ngoài Ø820 / Ø690mm",
      "Máy tiện Tiện T1517",
      "=H7/60",
      "860",
      "Chíp CNMG 160612 mác đúc hợp kim",
      "4",
      "0.5",
      "160000",
      "=(L7/J7)/K7",
      "1800000",
      "320000",
      "=G7*O7",
      "=M7+N7+P7"
    ],
    [
      "5",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "NC3",
      "G/c tiện tinh Ø570/220mm, bo cung R20",
      "Máy tiện Tiện T1516",
      "=H8/60",
      "240",
      "Chíp R5 THREADEX - P3200",
      "2",
      "1",
      "220000",
      "=(L8/J8)/K8",
      "500000",
      "320000",
      "=G8*O8",
      "=M8+N8+P8"
    ],
    [
      "6",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "NC4",
      "G/c tiện tinh trục Ø220 (+0.1/-0)mm",
      "Máy tiện Tiện T1516",
      "=H9/60",
      "60",
      "Chíp tiện tinh TNMG 160404 giảm chấn",
      "6",
      "2",
      "110000",
      "=(L9/J9)/K9",
      "150000",
      "320000",
      "=G9*O9",
      "=M9+N9+P9"
    ],
    [
      "7",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "NC5",
      "G/c tiện đầu đối diện Ø570/220mm đảo đầu",
      "Máy tiện Tiện T1516",
      "=H10/60",
      "240",
      "Chíp R5 THREADEX - P3200",
      "2",
      "1",
      "220000",
      "=(L10/J10)/K10",
      "500000",
      "320000",
      "=G10*O10",
      "=M10+N10+P10"
    ],
    [
      "8",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "NC6",
      "G/c tiện trục đối diện Ø220 (+0.1/-0) đảo đầu",
      "Máy tiện Tiện T1516",
      "=H11/60",
      "60",
      "Chíp tiện tinh TNMG 160404 giảm chấn",
      "6",
      "2",
      "110000",
      "=(L11/J11)/K11",
      "150000",
      "320000",
      "=G11*O11",
      "=M11+N11+P11"
    ],
    [
      "9",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "NC7",
      "G/c phay mp hoàn thiện 8 mặt x (690x80mm)",
      "Máy tiện Tiện T1522",
      "=H12/60",
      "225",
      "Đài phay mặt chíp APMT 1604 PDER",
      "2",
      "0.5",
      "95000",
      "=(L12/J12)/K12",
      "450000",
      "320000",
      "=G12*O12",
      "=M12+N12+P12"
    ],
    [
      "10",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "NC8",
      "G/c khoan 40 lỗ x Ø22mm",
      "Máy Khoan cần Yoshida",
      "=H13/60",
      "450",
      "Mũi khoan hợp kim gắn mảnh Ø22",
      "2",
      "2",
      "650000",
      "=(L13/J13)/K13",
      "650000",
      "130000",
      "=G13*O13",
      "=M13+N13+P13"
    ],
    [
      "11",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "NC9",
      "G/c khoan & taro 12 lỗ ren M16 x 2.0",
      "Máy Khoan cần Yoshida",
      "=H14/60",
      "450",
      "Mũi taro rãnh xoắn hợp kim M16",
      "1",
      "5",
      "450000",
      "=(L14/J14)/K14",
      "650000",
      "130000",
      "=G14*O14",
      "=M14+N14+P14"
    ],
    [
      "12",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Bích rulo (φ500x110) 1T",
      "NC1",
      "G/c tiện hoàn thiện ngoài Ø500/250mm",
      "Máy tiện FUJI",
      "=H15/60",
      "225",
      "Dao tiện WNMG 080408",
      "6",
      "1",
      "120000",
      "=(L15/J15)/K15",
      "250000",
      "220000",
      "=G15*O15",
      "=M15+N15+P15"
    ],
    [
      "13",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Bích rulo (φ500x110) 1T",
      "NC2",
      "G/c tiện móc lỗ côn 9° Ø160/Ø220mm",
      "Máy tiện FUJI",
      "=H16/60",
      "225",
      "Dao tiện lỗ trong TNMG 160408",
      "6",
      "1",
      "110000",
      "=(L16/J16)/K16",
      "250000",
      "220000",
      "=G16*O16",
      "=M16+N16+P16"
    ],
    [
      "14",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Bích rulo (φ500x110) 1T",
      "NC3",
      "G/c khoan 12-Ø17 / Ø25mm",
      "Máy Khoan cần Yoshida",
      "=H17/60",
      "120",
      "Mũi khoan xoắn hợp kim Ø17/Ø25",
      "2",
      "4",
      "320000",
      "=(L17/J17)/K17",
      "180000",
      "130000",
      "=G17*O17",
      "=M17+N17+P17"
    ],
    [
      "15",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Bích rulo (φ500x110) 1T",
      "NC4",
      "G/c cắt dây cavet DK7745 rãnh 32mm",
      "Máy Cắt Dây DK7745",
      "=H18/60",
      "150",
      "Dây cắt Molypden 0.18mm",
      "1",
      "10",
      "120000",
      "=(L18/J18)/K18",
      "150000",
      "110000",
      "=G18*O18",
      "=M18+N18+P18"
    ],
    [
      "16",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 355Dw900",
      "NC1",
      "G/c tiện thô & bán tinh biên dạng cánh xoắn đúc",
      "Máy tiện FUJI",
      "=H19/60",
      "180",
      "Chíp R5 THREADEX - P3200",
      "2",
      "0.5",
      "220000",
      "=(L19/J19)/K19",
      "450000",
      "220000",
      "=G19*O19",
      "=M19+N19+P19"
    ],
    [
      "17",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 355Dw900",
      "NC2",
      "G/c phay rãnh then cavet truyền động",
      "Máy Phay OKK3",
      "=H20/60",
      "90",
      "Dao phay ngón Solid Carbide Ø20",
      "4",
      "3",
      "320000",
      "=(L20/J20)/K20",
      "250000",
      "250000",
      "=G20*O20",
      "=M20+N20+P20"
    ],
    [
      "18",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 355Dw900",
      "NC3",
      "G/c tiện tinh hoàn thiện cánh xoắn & vát mép",
      "Máy tiện FUJI",
      "=H21/60",
      "120",
      "Chíp R5 THREADEX - P3200",
      "2",
      "1",
      "220000",
      "=(L21/J21)/K21",
      "350000",
      "220000",
      "=G21*O21",
      "=M21+N21+P21"
    ],
    [
      "19",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 114Dw300",
      "NC1",
      "G/c tiện hoàn thiện toàn bộ biên dạng cánh",
      "Máy tiện OKUMA",
      "=H22/60",
      "45",
      "Chíp R5 THREADEX - P3200",
      "2",
      "2",
      "220000",
      "=(L22/J22)/K22",
      "83700",
      "220000",
      "=G22*O22",
      "=M22+N22+P22"
    ],
    [
      "20",
      "Thyssen",
      "Sealing strip, below",
      "NC1",
      "G/c phay mặt phẳng NC1 kích thước 47mm",
      "Máy Phay OKK3",
      "=H23/60",
      "45",
      "Chíp Pramet 6 cạnh (HNGX 0906)",
      "6",
      "3",
      "140000",
      "=(L23/J23)/K23",
      "37200",
      "250000",
      "=G23*O23",
      "=M23+N23+P23"
    ],
    [
      "21",
      "Thyssen",
      "Sealing strip, below",
      "NC2",
      "G/c phay mặt phẳng NC2 kích thước 95mm",
      "Máy Phay OKK1",
      "=H24/60",
      "50",
      "Chíp APMT 1604 PDER - Pramet",
      "2",
      "2",
      "95000",
      "=(L24/J24)/K24",
      "37200",
      "250000",
      "=G24*O24",
      "=M24+N24+P24"
    ],
    [
      "22",
      "Thyssen",
      "Sealing strip, below",
      "NC3",
      "G/c phay cạnh NC3 kích thước 12mm",
      "Máy Phay OKK1",
      "=H25/60",
      "35",
      "Dao phay ngón Solid Carbide Ø12",
      "4",
      "8",
      "380000",
      "=(L25/J25)/K25",
      "45000",
      "250000",
      "=G25*O25",
      "=M25+N25+P25"
    ],
    [
      "23",
      "Thyssen",
      "Sealing strip, below",
      "NC4",
      "G/c khoan lỗ phi 14 / 2 lỗ",
      "Máy Khoan cần Yoshida",
      "=H26/60",
      "20",
      "Mũi khoan hợp kim Ø14",
      "2",
      "10",
      "280000",
      "=(L26/J26)/K26",
      "26148",
      "130000",
      "=G26*O26",
      "=M26+N26+P26"
    ],
    [
      "24",
      "Thyssen",
      "Sealing strip, above",
      "NC1",
      "G/c phay mặt phẳng NC1 kích thước 95mm",
      "Máy Phay OKK3",
      "=H27/60",
      "45",
      "Chíp Pramet 6 cạnh (HNGX 0906)",
      "6",
      "3",
      "140000",
      "=(L27/J27)/K27",
      "37200",
      "250000",
      "=G27*O27",
      "=M27+N27+P27"
    ],
    [
      "25",
      "Thyssen",
      "Sealing strip, above",
      "NC2",
      "G/c phay mặt phẳng NC2 kích thước 412mm",
      "Máy Phay OKK2",
      "=H28/60",
      "60",
      "Chíp APMT 1604 PDER - Pramet",
      "2",
      "1.5",
      "95000",
      "=(L28/J28)/K28",
      "45000",
      "250000",
      "=G28*O28",
      "=M28+N28+P28"
    ],
    [
      "26",
      "Thyssen",
      "Sealing strip, above",
      "NC3",
      "G/c phay mặt phẳng NC3 kích thước 412mm còn lại",
      "Máy Phay OKK2",
      "=H29/60",
      "60",
      "Chíp APMT 1604 PDER - Pramet",
      "2",
      "1.5",
      "95000",
      "=(L29/J29)/K29",
      "45000",
      "250000",
      "=G29*O29",
      "=M29+N29+P29"
    ],
    [
      "27",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "NC1",
      "G/c cắt dây định hình biên dạng đúc",
      "Máy Cắt Dây DK7745",
      "=H30/60",
      "150",
      "Dây cắt Molypden 0.18mm",
      "1",
      "5",
      "120000",
      "=(L30/J30)/K30",
      "148800",
      "110000",
      "=G30*O30",
      "=M30+N30+P30"
    ],
    [
      "28",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "NC2",
      "G/c khoan & taro ren M14",
      "Máy Khoan cần Yoshida",
      "=H31/60",
      "45",
      "Mũi taro rãnh xoắn M14",
      "1",
      "8",
      "320000",
      "=(L31/J31)/K31",
      "63767",
      "130000",
      "=G31*O31",
      "=M31+N31+P31"
    ],
    [
      "29",
      "UCC",
      "Khuôn gá xích POWER",
      "NC1",
      "G/c phay phá thô hốc khuôn gá",
      "Máy Phay CNC1",
      "=H32/60",
      "120",
      "Đài phay gắn mảnh APMT 1604",
      "2",
      "1",
      "95000",
      "=(L32/J32)/K32",
      "150000",
      "220000",
      "=G32*O32",
      "=M32+N32+P32"
    ],
    [
      "30",
      "UCC",
      "Khuôn gá xích POWER",
      "NC2",
      "G/c phay tinh biên dạng sau tôi",
      "Máy Phay CNC2",
      "=H33/60",
      "150",
      "Mảnh phay CBN gia công thép tôi",
      "2",
      "0.5",
      "450000",
      "=(L33/J33)/K33",
      "250000",
      "220000",
      "=G33*O33",
      "=M33+N33+P33"
    ],
    [
      "31",
      "Vico- QLTB",
      "Mẫu Thử CR & hàng #",
      "NC1",
      "G/c tiện hoàn thiện mẫu thử ASTM",
      "Máy tiện FUJI",
      "=H34/60",
      "40",
      "Dao tiện tinh TNMG 160404",
      "6",
      "5",
      "110000",
      "=(L34/J34)/K34",
      "79483",
      "220000",
      "=G34*O34",
      "=M34+N34+P34"
    ]
  ],
  "06_Ke_Hoach_Tien_Do_PO": [
    [
      "KẾ HOẠCH TIẾN ĐỘ SẢN XUẤT & ĐIỀU ĐỘ ĐƠN HÀNG (PO/LSX) THEO KHÁCH HÀNG"
    ],
    [
      "Phân xưởng Gia công Cơ khí | Tự động cân đối: Kế hoạch giao hàng - BTP xong tại xưởng - Đã bàn giao chuyển khâu - Tồn chờ bàn giao"
    ],
    [
      "STT",
      "Mã Lệnh SX / PO",
      "Khách Hàng",
      "Tên / Quy Cách Chi Tiết Đúc",
      "SL Kế Hoạch (Chi tiết)",
      "BTP Xong Tại Xưởng",
      "Đã Bàn Giao Đi",
      "Tồn Chờ Bàn Giao (WIP)",
      "Còn Nợ Kế Hoạch",
      "Khâu Chuyển Tiếp Theo",
      "Ngày Bắt Đầu",
      "Hạn Giao BTP",
      "Tiến Độ Bàn Giao (%)",
      "Trạng Thái Điều Độ"
    ],
    [
      "1",
      "PO-2026-001",
      "Win-Win",
      "Trục Khuỷu Động Cơ Φ250",
      "1000",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B4)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B4)",
      "=MAX(0, F4-G4)",
      "=MAX(0, E4-G4)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-01 00:00:00",
      "2026-08-30 00:00:00",
      "=IF(E4=0, 0, G4/E4)",
      "=IF(G4>=E4, \"Đã bàn giao đủ\", IF(F4>=E4, \"Xong xưởng - Chờ chuyển\", IF(F4>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "2",
      "PO-2026-002",
      "UCC",
      "Khuôn gá xích POWER",
      "200",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B5)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B5)",
      "=MAX(0, F5-G5)",
      "=MAX(0, E5-G5)",
      "PX Nhiệt Luyện (Tôi chân không)",
      "2026-08-05 00:00:00",
      "2026-08-20 00:00:00",
      "=IF(E5=0, 0, G5/E5)",
      "=IF(G5>=E5, \"Đã bàn giao đủ\", IF(F5>=E5, \"Xong xưởng - Chờ chuyển\", IF(F5>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "3",
      "PO-2026-003",
      "Vico- QLTB",
      "Mẫu Thử CR & hàng #",
      "500",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B6)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B6)",
      "=MAX(0, F6-G6)",
      "=MAX(0, E6-G6)",
      "Phòng KCS / Thử Nghiệm ASTM",
      "2026-08-10 00:00:00",
      "2026-08-25 00:00:00",
      "=IF(E6=0, 0, G6/E6)",
      "=IF(G6>=E6, \"Đã bàn giao đủ\", IF(F6>=E6, \"Xong xưởng - Chờ chuyển\", IF(F6>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "4",
      "PO-1602",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145)",
      "1",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B7)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B7)",
      "=MAX(0, F7-G7)",
      "=MAX(0, E7-G7)",
      "PX Nhiệt Luyện (Tôi cao tần)",
      "2026-08-30 00:00:00",
      "2026-09-06 00:00:00",
      "=IF(E7=0, 0, G7/E7)",
      "=IF(G7>=E7, \"Đã bàn giao đủ\", IF(F7>=E7, \"Xong xưởng - Chờ chuyển\", IF(F7>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "5",
      "PO-3429",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145)",
      "1",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B8)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B8)",
      "=MAX(0, F8-G8)",
      "=MAX(0, E8-G8)",
      "PX Nhiệt Luyện (Tôi cao tần)",
      "2026-08-31 00:00:00",
      "2026-09-07 00:00:00",
      "=IF(E8=0, 0, G8/E8)",
      "=IF(G8>=E8, \"Đã bàn giao đủ\", IF(F8>=E8, \"Xong xưởng - Chờ chuyển\", IF(F8>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "6",
      "PO-5670",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145)",
      "1",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B9)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B9)",
      "=MAX(0, F9-G9)",
      "=MAX(0, E9-G9)",
      "PX Nhiệt Luyện (Tôi cao tần)",
      "2026-08-31 00:00:00",
      "2026-09-07 00:00:00",
      "=IF(E9=0, 0, G9/E9)",
      "=IF(G9>=E9, \"Đã bàn giao đủ\", IF(F9>=E9, \"Xong xưởng - Chờ chuyển\", IF(F9>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "7",
      "PO-6829",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145)",
      "1",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B10)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B10)",
      "=MAX(0, F10-G10)",
      "=MAX(0, E10-G10)",
      "PX Nhiệt Luyện (Tôi cao tần)",
      "2026-09-01 00:00:00",
      "2026-09-08 00:00:00",
      "=IF(E10=0, 0, G10/E10)",
      "=IF(G10>=E10, \"Đã bàn giao đủ\", IF(F10>=E10, \"Xong xưởng - Chờ chuyển\", IF(F10>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "8",
      "PO-7044",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145)",
      "1",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B11)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B11)",
      "=MAX(0, F11-G11)",
      "=MAX(0, E11-G11)",
      "PX Nhiệt Luyện (Tôi cao tần)",
      "2026-08-30 00:00:00",
      "2026-09-06 00:00:00",
      "=IF(E11=0, 0, G11/E11)",
      "=IF(G11>=E11, \"Đã bàn giao đủ\", IF(F11>=E11, \"Xong xưởng - Chờ chuyển\", IF(F11>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "9",
      "PO-7189",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145)",
      "1",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B12)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B12)",
      "=MAX(0, F12-G12)",
      "=MAX(0, E12-G12)",
      "PX Nhiệt Luyện (Tôi cao tần)",
      "2026-08-30 00:00:00",
      "2026-09-06 00:00:00",
      "=IF(E12=0, 0, G12/E12)",
      "=IF(G12>=E12, \"Đã bàn giao đủ\", IF(F12>=E12, \"Xong xưởng - Chờ chuyển\", IF(F12>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "10",
      "PO-7365",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145)",
      "1",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B13)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B13)",
      "=MAX(0, F13-G13)",
      "=MAX(0, E13-G13)",
      "PX Nhiệt Luyện (Tôi cao tần)",
      "2026-08-29 00:00:00",
      "2026-09-05 00:00:00",
      "=IF(E13=0, 0, G13/E13)",
      "=IF(G13>=E13, \"Đã bàn giao đủ\", IF(F13>=E13, \"Xong xưởng - Chờ chuyển\", IF(F13>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "11",
      "PO-1279",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rồ to (φ820x890)",
      "15",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B14)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B14)",
      "=MAX(0, F14-G14)",
      "=MAX(0, E14-G14)",
      "Tổ Lắp Ráp & Hoàn Thiện",
      "2026-09-01 00:00:00",
      "2026-09-08 00:00:00",
      "=IF(E14=0, 0, G14/E14)",
      "=IF(G14>=E14, \"Đã bàn giao đủ\", IF(F14>=E14, \"Xong xưởng - Chờ chuyển\", IF(F14>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "12",
      "PO-2504",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rồ to (φ820x890)",
      "2",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B15)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B15)",
      "=MAX(0, F15-G15)",
      "=MAX(0, E15-G15)",
      "Tổ Lắp Ráp & Hoàn Thiện",
      "2026-08-21 00:00:00",
      "2026-08-28 00:00:00",
      "=IF(E15=0, 0, G15/E15)",
      "=IF(G15>=E15, \"Đã bàn giao đủ\", IF(F15>=E15, \"Xong xưởng - Chờ chuyển\", IF(F15>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "13",
      "PO-4603",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rồ to (φ820x890)",
      "1",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B16)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B16)",
      "=MAX(0, F16-G16)",
      "=MAX(0, E16-G16)",
      "Tổ Lắp Ráp & Hoàn Thiện",
      "2026-08-17 00:00:00",
      "2026-08-24 00:00:00",
      "=IF(E16=0, 0, G16/E16)",
      "=IF(G16>=E16, \"Đã bàn giao đủ\", IF(F16>=E16, \"Xong xưởng - Chờ chuyển\", IF(F16>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "14",
      "PO-5612",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Bích rulo (φ500x110) 1T",
      "1",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B17)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B17)",
      "=MAX(0, F17-G17)",
      "=MAX(0, E17-G17)",
      "Tổ Lắp Ráp & Hoàn Thiện",
      "2026-08-17 00:00:00",
      "2026-08-24 00:00:00",
      "=IF(E17=0, 0, G17/E17)",
      "=IF(G17>=E17, \"Đã bàn giao đủ\", IF(F17>=E17, \"Xong xưởng - Chờ chuyển\", IF(F17>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "15",
      "PO-7487",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rồ to (φ820x890)",
      "3",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B18)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B18)",
      "=MAX(0, F18-G18)",
      "=MAX(0, E18-G18)",
      "Tổ Lắp Ráp & Hoàn Thiện",
      "2026-08-19 00:00:00",
      "2026-08-26 00:00:00",
      "=IF(E18=0, 0, G18/E18)",
      "=IF(G18>=E18, \"Đã bàn giao đủ\", IF(F18>=E18, \"Xong xưởng - Chờ chuyển\", IF(F18>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "16",
      "PO-8134",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rồ to (φ820x890)",
      "15",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B19)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B19)",
      "=MAX(0, F19-G19)",
      "=MAX(0, E19-G19)",
      "Tổ Lắp Ráp & Hoàn Thiện",
      "2026-09-01 00:00:00",
      "2026-09-08 00:00:00",
      "=IF(E19=0, 0, G19/E19)",
      "=IF(G19>=E19, \"Đã bàn giao đủ\", IF(F19>=E19, \"Xong xưởng - Chờ chuyển\", IF(F19>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "17",
      "PO-1537",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "1",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B20)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B20)",
      "=MAX(0, F20-G20)",
      "=MAX(0, E20-G20)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-17 00:00:00",
      "2026-08-24 00:00:00",
      "=IF(E20=0, 0, G20/E20)",
      "=IF(G20>=E20, \"Đã bàn giao đủ\", IF(F20>=E20, \"Xong xưởng - Chờ chuyển\", IF(F20>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "18",
      "PO-2080",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "2",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B21)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B21)",
      "=MAX(0, F21-G21)",
      "=MAX(0, E21-G21)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-31 00:00:00",
      "2026-09-07 00:00:00",
      "=IF(E21=0, 0, G21/E21)",
      "=IF(G21>=E21, \"Đã bàn giao đủ\", IF(F21>=E21, \"Xong xưởng - Chờ chuyển\", IF(F21>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "19",
      "PO-2227",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "1",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B22)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B22)",
      "=MAX(0, F22-G22)",
      "=MAX(0, E22-G22)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-19 00:00:00",
      "2026-08-26 00:00:00",
      "=IF(E22=0, 0, G22/E22)",
      "=IF(G22>=E22, \"Đã bàn giao đủ\", IF(F22>=E22, \"Xong xưởng - Chờ chuyển\", IF(F22>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "20",
      "PO-2285",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "1",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B23)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B23)",
      "=MAX(0, F23-G23)",
      "=MAX(0, E23-G23)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-09-01 00:00:00",
      "2026-09-08 00:00:00",
      "=IF(E23=0, 0, G23/E23)",
      "=IF(G23>=E23, \"Đã bàn giao đủ\", IF(F23>=E23, \"Xong xưởng - Chờ chuyển\", IF(F23>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "21",
      "PO-3079",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "40",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B24)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B24)",
      "=MAX(0, F24-G24)",
      "=MAX(0, E24-G24)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-21 00:00:00",
      "2026-08-28 00:00:00",
      "=IF(E24=0, 0, G24/E24)",
      "=IF(G24>=E24, \"Đã bàn giao đủ\", IF(F24>=E24, \"Xong xưởng - Chờ chuyển\", IF(F24>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "22",
      "PO-3081",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "1",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B25)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B25)",
      "=MAX(0, F25-G25)",
      "=MAX(0, E25-G25)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-18 00:00:00",
      "2026-08-25 00:00:00",
      "=IF(E25=0, 0, G25/E25)",
      "=IF(G25>=E25, \"Đã bàn giao đủ\", IF(F25>=E25, \"Xong xưởng - Chờ chuyển\", IF(F25>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "23",
      "PO-3455",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "1",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B26)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B26)",
      "=MAX(0, F26-G26)",
      "=MAX(0, E26-G26)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-31 00:00:00",
      "2026-09-07 00:00:00",
      "=IF(E26=0, 0, G26/E26)",
      "=IF(G26>=E26, \"Đã bàn giao đủ\", IF(F26>=E26, \"Xong xưởng - Chờ chuyển\", IF(F26>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "24",
      "PO-3528",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "1",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B27)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B27)",
      "=MAX(0, F27-G27)",
      "=MAX(0, E27-G27)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-16 00:00:00",
      "2026-08-23 00:00:00",
      "=IF(E27=0, 0, G27/E27)",
      "=IF(G27>=E27, \"Đã bàn giao đủ\", IF(F27>=E27, \"Xong xưởng - Chờ chuyển\", IF(F27>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "25",
      "PO-4481",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "1",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B28)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B28)",
      "=MAX(0, F28-G28)",
      "=MAX(0, E28-G28)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-16 00:00:00",
      "2026-08-23 00:00:00",
      "=IF(E28=0, 0, G28/E28)",
      "=IF(G28>=E28, \"Đã bàn giao đủ\", IF(F28>=E28, \"Xong xưởng - Chờ chuyển\", IF(F28>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "26",
      "PO-4525",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "15",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B29)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B29)",
      "=MAX(0, F29-G29)",
      "=MAX(0, E29-G29)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-19 00:00:00",
      "2026-08-26 00:00:00",
      "=IF(E29=0, 0, G29/E29)",
      "=IF(G29>=E29, \"Đã bàn giao đủ\", IF(F29>=E29, \"Xong xưởng - Chờ chuyển\", IF(F29>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "27",
      "PO-4545",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "2",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B30)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B30)",
      "=MAX(0, F30-G30)",
      "=MAX(0, E30-G30)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-14 00:00:00",
      "2026-08-21 00:00:00",
      "=IF(E30=0, 0, G30/E30)",
      "=IF(G30>=E30, \"Đã bàn giao đủ\", IF(F30>=E30, \"Xong xưởng - Chờ chuyển\", IF(F30>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "28",
      "PO-5710",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "1",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B31)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B31)",
      "=MAX(0, F31-G31)",
      "=MAX(0, E31-G31)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-20 00:00:00",
      "2026-08-27 00:00:00",
      "=IF(E31=0, 0, G31/E31)",
      "=IF(G31>=E31, \"Đã bàn giao đủ\", IF(F31>=E31, \"Xong xưởng - Chờ chuyển\", IF(F31>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "29",
      "PO-6183",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "1",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B32)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B32)",
      "=MAX(0, F32-G32)",
      "=MAX(0, E32-G32)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-19 00:00:00",
      "2026-08-26 00:00:00",
      "=IF(E32=0, 0, G32/E32)",
      "=IF(G32>=E32, \"Đã bàn giao đủ\", IF(F32>=E32, \"Xong xưởng - Chờ chuyển\", IF(F32>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "30",
      "PO-7253",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "17",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B33)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B33)",
      "=MAX(0, F33-G33)",
      "=MAX(0, E33-G33)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-20 00:00:00",
      "2026-08-27 00:00:00",
      "=IF(E33=0, 0, G33/E33)",
      "=IF(G33>=E33, \"Đã bàn giao đủ\", IF(F33>=E33, \"Xong xưởng - Chờ chuyển\", IF(F33>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "31",
      "PO-7319",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "2",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B34)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B34)",
      "=MAX(0, F34-G34)",
      "=MAX(0, E34-G34)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-15 00:00:00",
      "2026-08-22 00:00:00",
      "=IF(E34=0, 0, G34/E34)",
      "=IF(G34>=E34, \"Đã bàn giao đủ\", IF(F34>=E34, \"Xong xưởng - Chờ chuyển\", IF(F34>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "32",
      "PO-7432",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "8",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B35)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B35)",
      "=MAX(0, F35-G35)",
      "=MAX(0, E35-G35)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-22 00:00:00",
      "2026-08-29 00:00:00",
      "=IF(E35=0, 0, G35/E35)",
      "=IF(G35>=E35, \"Đã bàn giao đủ\", IF(F35>=E35, \"Xong xưởng - Chờ chuyển\", IF(F35>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "33",
      "PO-9119",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "1",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B36)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B36)",
      "=MAX(0, F36-G36)",
      "=MAX(0, E36-G36)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-19 00:00:00",
      "2026-08-26 00:00:00",
      "=IF(E36=0, 0, G36/E36)",
      "=IF(G36>=E36, \"Đã bàn giao đủ\", IF(F36>=E36, \"Xong xưởng - Chờ chuyển\", IF(F36>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "34",
      "PO-2891",
      "Molycop",
      "Bi 25",
      "10",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B37)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B37)",
      "=MAX(0, F37-G37)",
      "=MAX(0, E37-G37)",
      "Phòng KCS / Thí Nghiệm Cơ Tính",
      "2026-08-29 00:00:00",
      "2026-09-05 00:00:00",
      "=IF(E37=0, 0, G37/E37)",
      "=IF(G37>=E37, \"Đã bàn giao đủ\", IF(F37>=E37, \"Xong xưởng - Chờ chuyển\", IF(F37>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "35",
      "PO-4099",
      "Molycop",
      "Bi 40",
      "30",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B38)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B38)",
      "=MAX(0, F38-G38)",
      "=MAX(0, E38-G38)",
      "Phòng KCS / Thí Nghiệm Cơ Tính",
      "2026-08-23 00:00:00",
      "2026-08-30 00:00:00",
      "=IF(E38=0, 0, G38/E38)",
      "=IF(G38>=E38, \"Đã bàn giao đủ\", IF(F38>=E38, \"Xong xưởng - Chờ chuyển\", IF(F38>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "36",
      "PO-4474",
      "Molycop",
      "Bi 25",
      "3",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B39)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B39)",
      "=MAX(0, F39-G39)",
      "=MAX(0, E39-G39)",
      "Phòng KCS / Thí Nghiệm Cơ Tính",
      "2026-08-20 00:00:00",
      "2026-08-27 00:00:00",
      "=IF(E39=0, 0, G39/E39)",
      "=IF(G39>=E39, \"Đã bàn giao đủ\", IF(F39>=E39, \"Xong xưởng - Chờ chuyển\", IF(F39>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "37",
      "PO-5163",
      "Molycop",
      "Bi 40",
      "19",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B40)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B40)",
      "=MAX(0, F40-G40)",
      "=MAX(0, E40-G40)",
      "Phòng KCS / Thí Nghiệm Cơ Tính",
      "2026-08-29 00:00:00",
      "2026-09-05 00:00:00",
      "=IF(E40=0, 0, G40/E40)",
      "=IF(G40>=E40, \"Đã bàn giao đủ\", IF(F40>=E40, \"Xong xưởng - Chờ chuyển\", IF(F40>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "38",
      "PO-5200",
      "Molycop",
      "Bi 25",
      "19",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B41)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B41)",
      "=MAX(0, F41-G41)",
      "=MAX(0, E41-G41)",
      "Phòng KCS / Thí Nghiệm Cơ Tính",
      "2026-08-17 00:00:00",
      "2026-08-24 00:00:00",
      "=IF(E41=0, 0, G41/E41)",
      "=IF(G41>=E41, \"Đã bàn giao đủ\", IF(F41>=E41, \"Xong xưởng - Chờ chuyển\", IF(F41>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "39",
      "PO-7435",
      "Molycop",
      "Bi 90",
      "3",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B42)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B42)",
      "=MAX(0, F42-G42)",
      "=MAX(0, E42-G42)",
      "Phòng KCS / Thí Nghiệm Cơ Tính",
      "2026-08-14 00:00:00",
      "2026-08-21 00:00:00",
      "=IF(E42=0, 0, G42/E42)",
      "=IF(G42>=E42, \"Đã bàn giao đủ\", IF(F42>=E42, \"Xong xưởng - Chờ chuyển\", IF(F42>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "40",
      "PO-8205",
      "Molycop",
      "Bi 40",
      "7",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B43)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B43)",
      "=MAX(0, F43-G43)",
      "=MAX(0, E43-G43)",
      "Phòng KCS / Thí Nghiệm Cơ Tính",
      "2026-08-14 00:00:00",
      "2026-08-21 00:00:00",
      "=IF(E43=0, 0, G43/E43)",
      "=IF(G43>=E43, \"Đã bàn giao đủ\", IF(F43>=E43, \"Xong xưởng - Chờ chuyển\", IF(F43>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "41",
      "PO-8823",
      "Molycop",
      "Bi 40",
      "21",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B44)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B44)",
      "=MAX(0, F44-G44)",
      "=MAX(0, E44-G44)",
      "Phòng KCS / Thí Nghiệm Cơ Tính",
      "2026-08-20 00:00:00",
      "2026-08-27 00:00:00",
      "=IF(E44=0, 0, G44/E44)",
      "=IF(G44>=E44, \"Đã bàn giao đủ\", IF(F44>=E44, \"Xong xưởng - Chờ chuyển\", IF(F44>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "42",
      "PO-9933",
      "Molycop",
      "Bi 40",
      "5",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B45)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B45)",
      "=MAX(0, F45-G45)",
      "=MAX(0, E45-G45)",
      "Phòng KCS / Thí Nghiệm Cơ Tính",
      "2026-08-17 00:00:00",
      "2026-08-24 00:00:00",
      "=IF(E45=0, 0, G45/E45)",
      "=IF(G45>=E45, \"Đã bàn giao đủ\", IF(F45>=E45, \"Xong xưởng - Chờ chuyển\", IF(F45>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "43",
      "PO-1243",
      "TFG",
      "Taytona Drawing No 2CG00820",
      "1",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B46)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B46)",
      "=MAX(0, F46-G46)",
      "=MAX(0, E46-G46)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-09-01 00:00:00",
      "2026-09-08 00:00:00",
      "=IF(E46=0, 0, G46/E46)",
      "=IF(G46>=E46, \"Đã bàn giao đủ\", IF(F46>=E46, \"Xong xưởng - Chờ chuyển\", IF(F46>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "44",
      "PO-1400",
      "TFG",
      "Taytona Drawing No 2CG00820",
      "1",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B47)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B47)",
      "=MAX(0, F47-G47)",
      "=MAX(0, E47-G47)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-31 00:00:00",
      "2026-09-07 00:00:00",
      "=IF(E47=0, 0, G47/E47)",
      "=IF(G47>=E47, \"Đã bàn giao đủ\", IF(F47>=E47, \"Xong xưởng - Chờ chuyển\", IF(F47>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "45",
      "PO-1877",
      "TFG",
      "Pattern Drawing No 2CG00820",
      "1",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B48)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B48)",
      "=MAX(0, F48-G48)",
      "=MAX(0, E48-G48)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-30 00:00:00",
      "2026-09-06 00:00:00",
      "=IF(E48=0, 0, G48/E48)",
      "=IF(G48>=E48, \"Đã bàn giao đủ\", IF(F48>=E48, \"Xong xưởng - Chờ chuyển\", IF(F48>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "46",
      "PO-3223",
      "TFG",
      "Nut cover số hiệu F3P00064-2 theo bản vẽ 2CG01074",
      "1",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B49)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B49)",
      "=MAX(0, F49-G49)",
      "=MAX(0, E49-G49)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-18 00:00:00",
      "2026-08-25 00:00:00",
      "=IF(E49=0, 0, G49/E49)",
      "=IF(G49>=E49, \"Đã bàn giao đủ\", IF(F49>=E49, \"Xong xưởng - Chờ chuyển\", IF(F49>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "47",
      "PO-8916",
      "TFG",
      "Pattern Drawing No 2CG00820",
      "1",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B50)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B50)",
      "=MAX(0, F50-G50)",
      "=MAX(0, E50-G50)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-29 00:00:00",
      "2026-09-05 00:00:00",
      "=IF(E50=0, 0, G50/E50)",
      "=IF(G50>=E50, \"Đã bàn giao đủ\", IF(F50>=E50, \"Xong xưởng - Chờ chuyển\", IF(F50>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "48",
      "PO-9407",
      "TFG",
      "Nut cover số hiệu E4P08508 theo bản vẽ 2CG00744",
      "1",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B51)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B51)",
      "=MAX(0, F51-G51)",
      "=MAX(0, E51-G51)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-23 00:00:00",
      "2026-08-30 00:00:00",
      "=IF(E51=0, 0, G51/E51)",
      "=IF(G51>=E51, \"Đã bàn giao đủ\", IF(F51>=E51, \"Xong xưởng - Chờ chuyển\", IF(F51>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "49",
      "PO-1050",
      "Thyssen",
      "Sealing trip, below",
      "6",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B52)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B52)",
      "=MAX(0, F52-G52)",
      "=MAX(0, E52-G52)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-15 00:00:00",
      "2026-08-22 00:00:00",
      "=IF(E52=0, 0, G52/E52)",
      "=IF(G52>=E52, \"Đã bàn giao đủ\", IF(F52>=E52, \"Xong xưởng - Chờ chuyển\", IF(F52>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "50",
      "PO-1091",
      "Thyssen",
      "Sealing strip, above",
      "9",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B53)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B53)",
      "=MAX(0, F53-G53)",
      "=MAX(0, E53-G53)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-27 00:00:00",
      "2026-09-03 00:00:00",
      "=IF(E53=0, 0, G53/E53)",
      "=IF(G53>=E53, \"Đã bàn giao đủ\", IF(F53>=E53, \"Xong xưởng - Chờ chuyển\", IF(F53>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "51",
      "PO-1099",
      "Thyssen",
      "Sealing strip, above",
      "15",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B54)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B54)",
      "=MAX(0, F54-G54)",
      "=MAX(0, E54-G54)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-31 00:00:00",
      "2026-09-07 00:00:00",
      "=IF(E54=0, 0, G54/E54)",
      "=IF(G54>=E54, \"Đã bàn giao đủ\", IF(F54>=E54, \"Xong xưởng - Chờ chuyển\", IF(F54>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "52",
      "PO-1112",
      "Thyssen",
      "Sealing strip, below",
      "14",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B55)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B55)",
      "=MAX(0, F55-G55)",
      "=MAX(0, E55-G55)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-18 00:00:00",
      "2026-08-25 00:00:00",
      "=IF(E55=0, 0, G55/E55)",
      "=IF(G55>=E55, \"Đã bàn giao đủ\", IF(F55>=E55, \"Xong xưởng - Chờ chuyển\", IF(F55>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "53",
      "PO-1168",
      "Thyssen",
      "Sealing strip, above",
      "8",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B56)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B56)",
      "=MAX(0, F56-G56)",
      "=MAX(0, E56-G56)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-28 00:00:00",
      "2026-09-04 00:00:00",
      "=IF(E56=0, 0, G56/E56)",
      "=IF(G56>=E56, \"Đã bàn giao đủ\", IF(F56>=E56, \"Xong xưởng - Chờ chuyển\", IF(F56>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "54",
      "PO-1193",
      "Thyssen",
      "Sealing trip, below",
      "13",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B57)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B57)",
      "=MAX(0, F57-G57)",
      "=MAX(0, E57-G57)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-15 00:00:00",
      "2026-08-22 00:00:00",
      "=IF(E57=0, 0, G57/E57)",
      "=IF(G57>=E57, \"Đã bàn giao đủ\", IF(F57>=E57, \"Xong xưởng - Chờ chuyển\", IF(F57>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "55",
      "PO-1415",
      "Thyssen",
      "Sealing strip, above",
      "2",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B58)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B58)",
      "=MAX(0, F58-G58)",
      "=MAX(0, E58-G58)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-29 00:00:00",
      "2026-09-05 00:00:00",
      "=IF(E58=0, 0, G58/E58)",
      "=IF(G58>=E58, \"Đã bàn giao đủ\", IF(F58>=E58, \"Xong xưởng - Chờ chuyển\", IF(F58>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "56",
      "PO-1464",
      "Thyssen",
      "Sealing trip, below",
      "29",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B59)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B59)",
      "=MAX(0, F59-G59)",
      "=MAX(0, E59-G59)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-16 00:00:00",
      "2026-08-23 00:00:00",
      "=IF(E59=0, 0, G59/E59)",
      "=IF(G59>=E59, \"Đã bàn giao đủ\", IF(F59>=E59, \"Xong xưởng - Chờ chuyển\", IF(F59>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "57",
      "PO-1494",
      "Thyssen",
      "Sealing trip, below",
      "8",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B60)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B60)",
      "=MAX(0, F60-G60)",
      "=MAX(0, E60-G60)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-14 00:00:00",
      "2026-08-21 00:00:00",
      "=IF(E60=0, 0, G60/E60)",
      "=IF(G60>=E60, \"Đã bàn giao đủ\", IF(F60>=E60, \"Xong xưởng - Chờ chuyển\", IF(F60>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "58",
      "PO-1502",
      "Thyssen",
      "Sealing trip, below",
      "5",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B61)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B61)",
      "=MAX(0, F61-G61)",
      "=MAX(0, E61-G61)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-19 00:00:00",
      "2026-08-26 00:00:00",
      "=IF(E61=0, 0, G61/E61)",
      "=IF(G61>=E61, \"Đã bàn giao đủ\", IF(F61>=E61, \"Xong xưởng - Chờ chuyển\", IF(F61>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "59",
      "PO-1545",
      "Thyssen",
      "Sealing strip, below",
      "26",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B62)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B62)",
      "=MAX(0, F62-G62)",
      "=MAX(0, E62-G62)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-19 00:00:00",
      "2026-08-26 00:00:00",
      "=IF(E62=0, 0, G62/E62)",
      "=IF(G62>=E62, \"Đã bàn giao đủ\", IF(F62>=E62, \"Xong xưởng - Chờ chuyển\", IF(F62>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "60",
      "PO-1592",
      "Thyssen",
      "Sealing strip, below",
      "16",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B63)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B63)",
      "=MAX(0, F63-G63)",
      "=MAX(0, E63-G63)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-09-02 00:00:00",
      "2026-09-09 00:00:00",
      "=IF(E63=0, 0, G63/E63)",
      "=IF(G63>=E63, \"Đã bàn giao đủ\", IF(F63>=E63, \"Xong xưởng - Chờ chuyển\", IF(F63>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ],
    [
      "61",
      "PO-1695",
      "Thyssen",
      "Sealing trip, below",
      "10",
      "=SUMIFS('Nhật Ký Sản Lượng'!$J:$J, 'Nhật Ký Sản Lượng'!$G:$G, B64)",
      "=SUMIFS('09_Truy_Xuat_BTP_Luan_Chuyen'!$G:$G, '09_Truy_Xuat_BTP_Luan_Chuyen'!$C:$C, B64)",
      "=MAX(0, F64-G64)",
      "=MAX(0, E64-G64)",
      "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)",
      "2026-08-15 00:00:00",
      "2026-08-22 00:00:00",
      "=IF(E64=0, 0, G64/E64)",
      "=IF(G64>=E64, \"Đã bàn giao đủ\", IF(F64>=E64, \"Xong xưởng - Chờ chuyển\", IF(F64>0, \"Đang gia công trên máy\", \"Chờ nhận phôi đúc\")))"
    ]
  ],
  "08_Kiem_Soat_Chat_Luong_QA": [
    [
      "HỆ THỐNG KIỂM SOÁT CHẤT LƯỢNG TOÀN DIỆN (QA/QC) & PHÂN TÍCH NGUYÊN NHÂN PHẾ PHẨM"
    ],
    [
      "Phân xưởng Gia công Cơ khí | Tách bạch nguyên nhân: Lỗi Khâu Đúc (Rỗ xỉ/Nứt/Co ngót) vs Lỗi Gia Công (Lẹm kích thước/Cháy dao/Gá lệch) để tính công bằng chi phí"
    ],
    [
      "STT",
      "Ngày Phát Hiện",
      "Mã PO / LSX",
      "Khách Hàng",
      "Tên Chi Tiết / Quy Cách",
      "Nguyên Công Phát Hiện",
      "Thợ Vận Hành",
      "Máy Gia Công",
      "SL Hỏng (NG)",
      "Nguồn Gốc Lỗi (Phân Loại)",
      "Mô Tả Khuyết Tật & Nguyên Nhân",
      "Biện Pháp Xử Lý (Hủy/Hàn/Sửa)",
      "Trách Nhiệm Chi Phí (Đúc / Thợ / Xưởng)"
    ],
    [
      "1",
      "2026-08-21 00:00:00",
      "PO-3733",
      "Win-Win",
      "ISHIZUE 318Dw800",
      "G/c hoàn thiện",
      "Đặng Ngọc Long",
      "Máy tiện FUJI",
      "2",
      "Lỗi Đúc Thép",
      "Phôi đúc bị rỗ xỉ và nứt ngầm bộc lộ khi tiện hớt lớp vỏ ngoài",
      "Hủy phôi, chuyển nấu đúc lại",
      "Tính vào chi phí Phân xưởng Đúc (Thợ vẫn được tính 100% công gọt)"
    ],
    [
      "2",
      "2026-08-22 00:00:00",
      "PO-3733",
      "Win-Win",
      "ISHIZUE 318Dw800",
      "G/c hoàn thiện",
      "Đặng Ngọc Long",
      "Máy tiện FUJI",
      "7",
      "Lỗi Đúc Thép",
      "Ngậm cát đúc làm mẻ chíp và rỗ bề mặt cánh xoắn",
      "Hàn đắp sửa chữa và tiện lại",
      "Phân xưởng Đúc chịu chi phí dao bù và que hàn"
    ],
    [
      "3",
      "2026-08-24 00:00:00",
      "PO-5313",
      "Thyssen",
      "Sealing trip, below",
      "G/c phay Mp NC2 Kt 95mm",
      "Phạm Văn Tráng",
      "Máy Phay OKK1",
      "1",
      "Lỗi Thao Tác Thợ",
      "Thợ đo sai cữ làm lẹm kích thước 0.3mm vượt dung sai bản vẽ",
      "Hạ cấp dùng làm mẫu thử nội bộ",
      "Trừ tiền khoán nguyên công và trừ 50% tiền mảnh chíp"
    ],
    [
      "4",
      "2026-08-26 00:00:00",
      "PO-7365",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145)",
      "G/c phay NC1",
      "Phùng Đình Hùng",
      "Máy Phay OIGO",
      "1",
      "Lỗi Đúc Thép",
      "Phôi đúc Mn13 bị co ngót ở gân chịu lực chính",
      "Hủy chuyển lò luyện",
      "Khâu Đúc chịu trách nhiệm đúc bù phôi mới"
    ],
    [
      "5",
      "2026-08-28 00:00:00",
      "PO-4603",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền: Thân rô to",
      "G/c NC7 phay 8 mặt",
      "Vũ Tiến Thuận",
      "Máy tiện Tiện T1522",
      "1",
      "Lỗi Gá Kẹp / Thiết Bị",
      "Rơ bàn trượt máy phay làm sai lệch bước chia độ 8 mặt",
      "Hiệu chỉnh máy và phay bù lớp mỏng",
      "Phân xưởng Cơ khí chịu chi phí giờ máy căn chỉnh"
    ],
    [
      "6",
      "2026-08-29 00:00:00",
      "PO-3081",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "G/c khoan taro M14",
      "Nguyễn Trung Đông",
      "Máy Khoan cần Yoshida",
      "2",
      "Lỗi Dụng Cụ Cắt",
      "Mũi taro cùn bị gãy kẹt trong lỗ ren",
      "Chuyển máy bắn điện EDM lấy mũi taro",
      "Xưởng hỗ trợ chi phí bắn điện, nhắc nhở kiểm tra mòn dao"
    ],
    [
      "7",
      "2026-08-30 00:00:00",
      "PO-1456",
      "UCC",
      "Khuôn gá xích POWER",
      "G/c phay thô NC1",
      "Trần Văn Dũng",
      "Máy Phay CNC1",
      "1",
      "Lỗi Đúc Thép",
      "Phôi đúc hợp kim Cr12MoV bị xốp khí bên trong lòng khuôn",
      "Trả về kho phôi đúc hủy lô",
      "Phân xưởng Đúc xuất phôi bù"
    ]
  ],
  "09_Truy_Xuat_BTP_Luan_Chuyen": [
    [
      "SỔ TRUY XUẤT NGUỒN GỐC & BÀN GIAO BÁN THÀNH PHẨM (BTP) CƠ KHÍ"
    ],
    [
      "Phân xưởng Cơ khí | Truy xuất chuỗi: Đúc phôi -> Nhiệt luyện <-> Gia công nội bộ <-> Gia công ngoài (Sub-con) <-> Hoàn thiện"
    ],
    [
      "STT",
      "Ngày Luân Chuyển",
      "Mã PO / LSX",
      "Khách Hàng",
      "Tên Chi Tiết / Quy Cách",
      "Loại Luân Chuyển",
      "SL Bàn Giao",
      "Khâu Chuyển Đi (Nguồn)",
      "Khâu Tiếp Nhận (Đích)",
      "Số Phiếu / Biên Bản",
      "Người Bàn Giao",
      "Tình Trạng Kỹ Thuật / Ngoại Quan"
    ],
    [
      "1",
      "2026-08-15 00:00:00",
      "PO-2026-001",
      "Win-Win",
      "Trục Khuỷu Động Cơ Φ250",
      "Nội bộ -> Hoàn thiện",
      "500",
      "Xưởng Gia Công Cơ Khí",
      "Bộ phận Hoàn Thiện",
      "BB-BG-01",
      "Nguyễn Văn A",
      "Bàn giao BTP đợt 1 sang lắp ráp"
    ],
    [
      "2",
      "2026-08-18 00:00:00",
      "PO-2026-002",
      "UCC",
      "Khuôn gá xích POWER",
      "Nội bộ -> Nhiệt luyện",
      "200",
      "Xưởng Gia Công Cơ Khí",
      "Phân xưởng Nhiệt Luyện",
      "BB-BG-02",
      "Trần Văn B",
      "Phay thô xong, chuyển tôi thể tích"
    ],
    [
      "3",
      "2026-08-20 00:00:00",
      "PO-5999",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 355Dw900",
      "Xuất GIA CÔNG NGOÀI",
      "30",
      "Xưởng Gia Công Cơ Khí",
      "Xưởng cơ khí Hoàng Mai (Vệ tinh)",
      "BB-SUB-01",
      "Vũ Tiến Thuận",
      "Xuất phôi đúc đi tiện thô NC1 do máy FUJI quá tải"
    ],
    [
      "4",
      "2026-08-22 00:00:00",
      "PO-2026-002",
      "UCC",
      "Khuôn gá xích POWER",
      "Nhiệt luyện -> Gia công",
      "200",
      "Phân xưởng Nhiệt Luyện",
      "Xưởng Gia Công Cơ Khí",
      "BB-BG-03",
      "Trần Văn B",
      "Đã tôi đạt 58 HRC, nhận về mài phẳng tinh"
    ],
    [
      "5",
      "2026-08-24 00:00:00",
      "PO-3733",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 318Dw800",
      "Xuất GIA CÔNG NGOÀI",
      "45",
      "Xưởng Gia Công Cơ Khí",
      "Công ty Cơ khí Tân Phát (Vệ tinh)",
      "BB-SUB-02",
      "Phạm Văn Tráng",
      "Xuất phôi tiện thô NC1 để kịp deadline"
    ],
    [
      "6",
      "2026-08-25 00:00:00",
      "PO-4545",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "Nội bộ -> Hoàn thiện",
      "2",
      "Xưởng Gia Công Cơ Khí",
      "Bộ phận Hoàn Thiện",
      "BB-BG-04",
      "Phạm Văn Tráng",
      "Cắt dây hoàn tất, chuyển mài vát & hoàn thiện"
    ],
    [
      "7",
      "2026-08-26 00:00:00",
      "PO-3275",
      "Thyssen",
      "Sealing trip, below",
      "Nội bộ -> Hoàn thiện",
      "55",
      "Xưởng Gia Công Cơ Khí",
      "Bộ phận Hoàn Thiện",
      "BB-BG-05",
      "Phùng Công Thắng",
      "Khoan lỗ hoàn tất, chuyển tẩy bavia"
    ],
    [
      "8",
      "2026-08-27 00:00:00",
      "PO-5999",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 355Dw900",
      "Thu hồi từ GIA CÔNG NGOÀI",
      "30",
      "Xưởng cơ khí Hoàng Mai",
      "Xưởng Gia Công Cơ Khí",
      "BB-REC-01",
      "KCS / Nghiệm thu",
      "Đã tiện thô đạt kích thước, chuyển máy FUJI tiện tinh NC3"
    ],
    [
      "9",
      "2026-08-28 00:00:00",
      "PO-1602",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145)",
      "Nội bộ -> Nhiệt luyện",
      "1",
      "Xưởng Gia Công Cơ Khí",
      "Phân xưởng Nhiệt Luyện",
      "BB-BG-06",
      "Phùng Đình Hùng",
      "Phay xong rãnh, chuyển tôi cao tần"
    ],
    [
      "10",
      "2026-08-29 00:00:00",
      "PO-8134",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền: Thân rô to",
      "Nội bộ -> Hoàn thiện",
      "15",
      "Xưởng Gia Công Cơ Khí",
      "Bộ phận Hoàn Thiện",
      "BB-BG-07",
      "Vũ Tiến Thuận",
      "Hoàn tất NC9 khoan taro, chuyển lắp cụm"
    ]
  ],
  "10_Bang_Luong_Khoan_Tho": [
    [
      "BẢNG TỔNG HỢP LƯƠNG KHOÁN THEO CÔNG NHÂN & THEO DÕI NĂNG SUẤT"
    ],
    [
      "Phân xưởng Gia công Cơ khí | Tự động tổng hợp từ Nhật ký ca: Sản lượng OK - Sản lượng hỏng NG - Tiền khoán ca - Thưởng/Phạt dao cụ -> Thực lĩnh khoán"
    ],
    [
      "STT",
      "Mã NV",
      "Họ Và Tên Thợ Gia Công",
      "Máy Vận Hành Chính",
      "Số Ca Làm Việc",
      "Tổng Giờ Chạy Máy (h)",
      "Tổng SL Đạt (OK)",
      "Tổng SL Hỏng (NG)",
      "Tổng Tiền Khoán (VNĐ)",
      "Trừ Phạt Phế Phẩm/Dao",
      "LƯƠNG KHOÁN THỰC LĨNH (VNĐ)"
    ],
    [
      "1",
      "NV01",
      "Hoàng Ngọc Hà",
      "Máy tiện OKUMA",
      "=COUNTIF('Nhật Ký Sản Lượng'!$D:$D, C4)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C4, 'Nhật Ký Sản Lượng'!$P:$P)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C4, 'Nhật Ký Sản Lượng'!$J:$J)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C4, 'Nhật Ký Sản Lượng'!$L:$L)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C4, 'Nhật Ký Sản Lượng'!$M:$M)",
      "=SUMIFS('08_Kiem_Soat_Chat_Luong_QA'!$I:$I, '08_Kiem_Soat_Chat_Luong_QA'!$G:$G, C4, '08_Kiem_Soat_Chat_Luong_QA'!$J:$J, \"Lỗi Thao Tác Thợ\") * 100000",
      "=I4-J4"
    ],
    [
      "2",
      "NV02",
      "Nguyễn Trung Đông",
      "Máy tiện FUJI",
      "=COUNTIF('Nhật Ký Sản Lượng'!$D:$D, C5)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C5, 'Nhật Ký Sản Lượng'!$P:$P)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C5, 'Nhật Ký Sản Lượng'!$J:$J)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C5, 'Nhật Ký Sản Lượng'!$L:$L)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C5, 'Nhật Ký Sản Lượng'!$M:$M)",
      "=SUMIFS('08_Kiem_Soat_Chat_Luong_QA'!$I:$I, '08_Kiem_Soat_Chat_Luong_QA'!$G:$G, C5, '08_Kiem_Soat_Chat_Luong_QA'!$J:$J, \"Lỗi Thao Tác Thợ\") * 100000",
      "=I5-J5"
    ],
    [
      "3",
      "NV03",
      "Phùng Đình Hùng",
      "Máy tiện Tiện T1516",
      "=COUNTIF('Nhật Ký Sản Lượng'!$D:$D, C6)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C6, 'Nhật Ký Sản Lượng'!$P:$P)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C6, 'Nhật Ký Sản Lượng'!$J:$J)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C6, 'Nhật Ký Sản Lượng'!$L:$L)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C6, 'Nhật Ký Sản Lượng'!$M:$M)",
      "=SUMIFS('08_Kiem_Soat_Chat_Luong_QA'!$I:$I, '08_Kiem_Soat_Chat_Luong_QA'!$G:$G, C6, '08_Kiem_Soat_Chat_Luong_QA'!$J:$J, \"Lỗi Thao Tác Thợ\") * 100000",
      "=I6-J6"
    ],
    [
      "4",
      "NV04",
      "Vũ Tiến Thuận",
      "Máy tiện Tiện T1517",
      "=COUNTIF('Nhật Ký Sản Lượng'!$D:$D, C7)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C7, 'Nhật Ký Sản Lượng'!$P:$P)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C7, 'Nhật Ký Sản Lượng'!$J:$J)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C7, 'Nhật Ký Sản Lượng'!$L:$L)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C7, 'Nhật Ký Sản Lượng'!$M:$M)",
      "=SUMIFS('08_Kiem_Soat_Chat_Luong_QA'!$I:$I, '08_Kiem_Soat_Chat_Luong_QA'!$G:$G, C7, '08_Kiem_Soat_Chat_Luong_QA'!$J:$J, \"Lỗi Thao Tác Thợ\") * 100000",
      "=I7-J7"
    ],
    [
      "5",
      "NV05",
      "Nguyễn Mạnh Hà",
      "Máy Phay OKK1",
      "=COUNTIF('Nhật Ký Sản Lượng'!$D:$D, C8)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C8, 'Nhật Ký Sản Lượng'!$P:$P)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C8, 'Nhật Ký Sản Lượng'!$J:$J)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C8, 'Nhật Ký Sản Lượng'!$L:$L)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C8, 'Nhật Ký Sản Lượng'!$M:$M)",
      "=SUMIFS('08_Kiem_Soat_Chat_Luong_QA'!$I:$I, '08_Kiem_Soat_Chat_Luong_QA'!$G:$G, C8, '08_Kiem_Soat_Chat_Luong_QA'!$J:$J, \"Lỗi Thao Tác Thợ\") * 100000",
      "=I8-J8"
    ],
    [
      "6",
      "NV06",
      "Nguyễn Văn Thanh",
      "Máy tiện OKUMA",
      "=COUNTIF('Nhật Ký Sản Lượng'!$D:$D, C9)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C9, 'Nhật Ký Sản Lượng'!$P:$P)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C9, 'Nhật Ký Sản Lượng'!$J:$J)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C9, 'Nhật Ký Sản Lượng'!$L:$L)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C9, 'Nhật Ký Sản Lượng'!$M:$M)",
      "=SUMIFS('08_Kiem_Soat_Chat_Luong_QA'!$I:$I, '08_Kiem_Soat_Chat_Luong_QA'!$G:$G, C9, '08_Kiem_Soat_Chat_Luong_QA'!$J:$J, \"Lỗi Thao Tác Thợ\") * 100000",
      "=I9-J9"
    ],
    [
      "7",
      "NV07",
      "Phùng Gia Phúc",
      "Máy Phay OKK3",
      "=COUNTIF('Nhật Ký Sản Lượng'!$D:$D, C10)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C10, 'Nhật Ký Sản Lượng'!$P:$P)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C10, 'Nhật Ký Sản Lượng'!$J:$J)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C10, 'Nhật Ký Sản Lượng'!$L:$L)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C10, 'Nhật Ký Sản Lượng'!$M:$M)",
      "=SUMIFS('08_Kiem_Soat_Chat_Luong_QA'!$I:$I, '08_Kiem_Soat_Chat_Luong_QA'!$G:$G, C10, '08_Kiem_Soat_Chat_Luong_QA'!$J:$J, \"Lỗi Thao Tác Thợ\") * 100000",
      "=I10-J10"
    ],
    [
      "8",
      "NV08",
      "Trần Văn Dũng",
      "Máy Phay CNC1",
      "=COUNTIF('Nhật Ký Sản Lượng'!$D:$D, C11)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C11, 'Nhật Ký Sản Lượng'!$P:$P)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C11, 'Nhật Ký Sản Lượng'!$J:$J)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C11, 'Nhật Ký Sản Lượng'!$L:$L)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C11, 'Nhật Ký Sản Lượng'!$M:$M)",
      "=SUMIFS('08_Kiem_Soat_Chat_Luong_QA'!$I:$I, '08_Kiem_Soat_Chat_Luong_QA'!$G:$G, C11, '08_Kiem_Soat_Chat_Luong_QA'!$J:$J, \"Lỗi Thao Tác Thợ\") * 100000",
      "=I11-J11"
    ],
    [
      "9",
      "NV09",
      "Trần Đăng Ninh",
      "Máy Phay CNC2",
      "=COUNTIF('Nhật Ký Sản Lượng'!$D:$D, C12)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C12, 'Nhật Ký Sản Lượng'!$P:$P)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C12, 'Nhật Ký Sản Lượng'!$J:$J)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C12, 'Nhật Ký Sản Lượng'!$L:$L)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C12, 'Nhật Ký Sản Lượng'!$M:$M)",
      "=SUMIFS('08_Kiem_Soat_Chat_Luong_QA'!$I:$I, '08_Kiem_Soat_Chat_Luong_QA'!$G:$G, C12, '08_Kiem_Soat_Chat_Luong_QA'!$J:$J, \"Lỗi Thao Tác Thợ\") * 100000",
      "=I12-J12"
    ],
    [
      "10",
      "NV10",
      "Phạm Văn Tráng",
      "Máy Phay OKK1",
      "=COUNTIF('Nhật Ký Sản Lượng'!$D:$D, C13)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C13, 'Nhật Ký Sản Lượng'!$P:$P)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C13, 'Nhật Ký Sản Lượng'!$J:$J)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C13, 'Nhật Ký Sản Lượng'!$L:$L)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C13, 'Nhật Ký Sản Lượng'!$M:$M)",
      "=SUMIFS('08_Kiem_Soat_Chat_Luong_QA'!$I:$I, '08_Kiem_Soat_Chat_Luong_QA'!$G:$G, C13, '08_Kiem_Soat_Chat_Luong_QA'!$J:$J, \"Lỗi Thao Tác Thợ\") * 100000",
      "=I13-J13"
    ],
    [
      "11",
      "NV11",
      "Đặng Ngọc Long",
      "Máy tiện FUJI",
      "=COUNTIF('Nhật Ký Sản Lượng'!$D:$D, C14)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C14, 'Nhật Ký Sản Lượng'!$P:$P)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C14, 'Nhật Ký Sản Lượng'!$J:$J)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C14, 'Nhật Ký Sản Lượng'!$L:$L)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C14, 'Nhật Ký Sản Lượng'!$M:$M)",
      "=SUMIFS('08_Kiem_Soat_Chat_Luong_QA'!$I:$I, '08_Kiem_Soat_Chat_Luong_QA'!$G:$G, C14, '08_Kiem_Soat_Chat_Luong_QA'!$J:$J, \"Lỗi Thao Tác Thợ\") * 100000",
      "=I14-J14"
    ],
    [
      "12",
      "NV12",
      "Phùng Công Thắng",
      "Máy Cắt Dây DK7745",
      "=COUNTIF('Nhật Ký Sản Lượng'!$D:$D, C15)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C15, 'Nhật Ký Sản Lượng'!$P:$P)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C15, 'Nhật Ký Sản Lượng'!$J:$J)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C15, 'Nhật Ký Sản Lượng'!$L:$L)",
      "=SUMIF('Nhật Ký Sản Lượng'!$D:$D, C15, 'Nhật Ký Sản Lượng'!$M:$M)",
      "=SUMIFS('08_Kiem_Soat_Chat_Luong_QA'!$I:$I, '08_Kiem_Soat_Chat_Luong_QA'!$G:$G, C15, '08_Kiem_Soat_Chat_Luong_QA'!$J:$J, \"Lỗi Thao Tác Thợ\") * 100000",
      "=I15-J15"
    ],
    [
      "TỔNG CỘNG QUỸ LƯƠNG KHOÁN",
      "",
      "",
      "",
      "=SUM(E4:E15)",
      "=SUM(F4:F15)",
      "=SUM(G4:G15)",
      "=SUM(H4:H15)",
      "=SUM(I4:I15)",
      "=SUM(J4:J15)",
      "=SUM(K4:K15)"
    ]
  ],
  "11_Master_Data": [
    [
      "DANH MỤC MASTER DATA: KHÁCH HÀNG, ĐƠN GIÁ GIỜ MÁY & ĐƠN VỊ GIA CÔNG NGOÀI"
    ],
    [],
    [
      "DANH SÁCH KHÁCH HÀNG",
      "",
      "",
      "BẢNG ĐƠN GIÁ GIỜ MÁY NỘI BỘ",
      "",
      "",
      "",
      "DANH BẠ ĐƠN VỊ VỆ TINH GIA CÔNG NGOÀI (SUB-CON)"
    ],
    [
      "Mã KH",
      "Tên Đối Tác / Khách Hàng",
      "",
      "STT",
      "Dòng Máy / Thiết Bị",
      "Đơn Giá Giờ Máy (VNĐ/h)",
      "",
      "Mã Vệ Tinh",
      "Tên Doanh Nghiệp Vệ Tinh",
      "Năng Lực Gia Công Mạnh",
      "Đánh Giá Uy Tín KCS"
    ],
    [
      "KH01",
      "Thyssen",
      "",
      "1",
      "Máy tiện Tiện T1516 / T1517 / T1522 (Tiện đứng nặng)",
      "320000",
      "",
      "SUB-01",
      "Xưởng cơ khí Hoàng Mai",
      "Tiện CNC đường kính lớn Ø300 - Ø800",
      "Hạng A (Rất tốt)"
    ],
    [
      "KH02",
      "Win-Win",
      "",
      "2",
      "Máy Phay OIGO / Phay giường hạng nặng",
      "280000",
      "",
      "SUB-02",
      "Công ty Cơ khí Tân Phát",
      "Tiện CNC cánh xoắn vít đùn",
      "Hạng A (Rất tốt)"
    ],
    [
      "KH03",
      "Vico- QLTB",
      "",
      "3",
      "Máy Phay OKK1 / OKK2 / OKK3 (Phay CNC)",
      "250000",
      "",
      "SUB-03",
      "Xưởng Phay Giường Đức Long",
      "Phay giường phôi đúc nặng đến 5 tấn",
      "Hạng B (Đạt yêu cầu)"
    ],
    [
      "KH04",
      "Luợng- KS Tường Long",
      "",
      "4",
      "Máy Phay CNC1 / CNC2",
      "220000",
      "",
      "SUB-04",
      "Cắt dây CNC Nam Định",
      "Cắt dây Molypden độ dày đến 400mm",
      "Hạng A (Rất tốt)"
    ],
    [
      "KH05",
      "Molycop",
      "",
      "5",
      "Máy tiện FUJI / OKUMA / T630 / CNC1",
      "220000",
      "",
      "SUB-05",
      "Cơ khí Chính xác An Phát",
      "Phay CNC 3-4 trục, làm hốc khuôn",
      "Hạng A (Rất tốt)"
    ],
    [
      "KH06",
      "Hà Song Hải - XM Hạ Long",
      "",
      "6",
      "Máy Cắt Dây DK7745 / DK7780 / Podatech",
      "110000"
    ],
    [
      "KH07",
      "Hải- Vinh Quảng Ninh",
      "",
      "7",
      "Máy Khoan cần Yoshida",
      "130000"
    ],
    [
      "KH08",
      "TFG"
    ],
    [
      "KH09",
      "UCC"
    ]
  ]
};

function setup11ChuanHoaSheets() {
  var ss = getSpreadsheet();

  // Đảm bảo tồn tại Sheet 'Nhật Ký Sản Lượng' để bảo toàn dữ liệu
  var logSheet = ss.getSheetByName("Nhật Ký Sản Lượng");
  if (!logSheet) {
    logSheet = ss.insertSheet("Nhật Ký Sản Lượng");
    var defaultHeaders = [
      "STT", "Thời Gian Gửi", "Ngày Làm", "Họ Tên Công Nhân", "Khách Hàng", "Tên Sản Phẩm",
      "Số PO", "Nguyên Công", "Máy Gia Công", "SL Đạt (OK)", "SL Xử Lý", "SL Hủy",
      "Lương Khoán (VNĐ)", "Vật Tư / Chip", "SL Tiêu Hao", "Phút Dừng Máy", "Ghi Chú", "Link Ảnh Drive"
    ];
    logSheet.appendRow(defaultHeaders);
    logSheet.getRange(1, 1, 1, defaultHeaders.length).setFontWeight("bold").setBackground("#1e293b").setFontColor("#ffffff");
  }

  // Khởi tạo và đồng bộ từng sheet chuẩn hóa
  for (var sName in STANDARDIZED_SHEETS_DATA) {
    var sheetRows = STANDARDIZED_SHEETS_DATA[sName];
    if (!sheetRows || sheetRows.length === 0) continue;

    var sh = ss.getSheetByName(sName) || ss.insertSheet(sName);

    // Tính số cột lớn nhất
    var maxCols = 0;
    for (var r = 0; r < sheetRows.length; r++) {
      if (sheetRows[r].length > maxCols) maxCols = sheetRows[r].length;
    }
    if (maxCols === 0) continue;

    // Chuẩn hóa ma trận kích thước đồng đều
    var matrix = [];
    for (var r = 0; r < sheetRows.length; r++) {
      var row = sheetRows[r].slice();
      while (row.length < maxCols) row.push("");
      matrix.push(row);
    }

    // Ghi dữ liệu và công thức vào Sheet
    sh.clear();
    var range = sh.getRange(1, 1, matrix.length, maxCols);
    range.setValues(matrix);

    // Định dạng tiêu đề chuyên nghiệp
    try {
      sh.getRange(1, 1, 1, maxCols).setFontWeight("bold").setFontSize(13);
      if (matrix.length >= 3) {
        sh.getRange(3, 1, 1, maxCols)
          .setFontWeight("bold")
          .setBackground("#1e3a8a")
          .setFontColor("#ffffff")
          .setHorizontalAlignment("center");
        sh.setRowHeight(3, 30);
        sh.setFrozenRows(3);
      }
      sh.setHiddenGridlines(false);
    } catch (eStyle) {
      console.log("Style format notice: " + eStyle.toString());
    }
  }

  // Tự động xóa các sheet máy lẻ cũ
  try {
    deleteOld17MachineSheets();
  } catch (eDel) {
    console.log(eDel);
  }

  SpreadsheetApp.flush();
  Logger.log("✅ ĐÃ KHỞI TẠO THÀNH CÔNG TRỌN BỘ 11 SHEET CHUẨN HÓA & TRÍCH XUẤT TỰ ĐỘNG!");
  return "Đã khởi tạo thành công 11 Sheet chuẩn hóa và xóa 17 sheet máy lẻ cũ!";
}

// 🛠️ HÀM TÍNH TOÁN & CẬP NHẬT SỐ LIỆU THỰC TẾ TRỰC TIẾP
function calculateAndPopulateAllSheets() {
  var ss = getSpreadsheet();
  var logSheet = ss.getSheetByName("Nhật Ký Sản Lượng");
  if (!logSheet) return "Chưa có Nhật Ký Sản Lượng";

  // Cập nhật công thức và tính toán lại toàn bộ bảng tính
  SpreadsheetApp.flush();
  Logger.log("✅ Đã làm mới số liệu toàn bộ các sheet báo cáo từ Nhật Ký Sản Lượng!");
  return "Đã cập nhật số liệu mới nhất thành công!";
}
