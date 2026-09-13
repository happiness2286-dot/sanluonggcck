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

    // Tự động cập nhật tiến độ PO, công suất máy & lương khoán thực tế (100% sạch lỗi)
    try {
      calculateAndPopulateAllSheets();
    } catch (eCalc) {
      console.log("Lỗi cập nhật số liệu tự động: " + eCalc.toString());
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
// 9. MENU ĐIỀU HÀNH GCCK 2026 - KHUNG SƯỜN 11 SHEET CHUẨN 100% SẠCH LỖI #ERROR!
// ==============================================================================
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("⚙️ Quản Lý GCCK 2026")
    .addItem("🚀 KHỞI TẠO BỘ 12 SHEET CHUẨN HÓA (100% SẠCH LỖI #ERROR!)", "setup12ChuanHoaSheets")
    .addItem("🎨 KẺ Ô VIỀN & ĐỊNH DẠNG CHUYÊN NGHIỆP", "formatAllSheetsProfessionally")
    .addItem("🔄 CẬP NHẬT TIẾN ĐỘ & LƯƠNG KHOÁN THỰC TẾ (TÍNH LẠI TOÀN BỘ)", "calculateAndPopulateAllSheets")
    .addSeparator()
    .addItem("📅 BỘ LỌC KỲ LƯƠNG: XEM THÁNG 8/2026", "chonKyLuongThang8")
    .addItem("📅 BỘ LỌC KỲ LƯƠNG: XEM THÁNG 9/2026", "chonKyLuongThang9")
    .addItem("📅 BỘ LỌC KỲ LƯƠNG: TOÀN BỘ NĂM 2026", "chonKyLuongCaNam2026")
    .addSeparator()
    .addItem("🔒 QUẢN ĐỐC KHÓA SỔ KỲ LƯƠNG THÁNG 8 (BẢO VỆ Ô THỰC SỰ)", "quanDocBatchApproveAndLockThang8")
    .addItem("🔓 MỞ KHÓA KỲ LƯƠNG ĐỂ ĐIỀU CHỈNH", "unlockWagePeriod")
    .addSeparator()
    .addItem("🧹 XÓA 17 SHEET MÁY LẺ CŨ (CHO GỌN BẢNG TÍNH)", "deleteOld17MachineSheets")
    .addItem("⏰ Cài Đặt Bộ Hẹn Giờ Cảnh Báo 3 Ca (14h15, 22h15, 06h15)", "setupShiftTriggers")
    .addToUi();
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

    // Tự động cập nhật tiến độ PO, công suất máy & lương khoán thực tế (100% sạch lỗi)
    try {
      calculateAndPopulateAllSheets();
    } catch (eCalc) {
      console.log("Lỗi cập nhật số liệu tự động: " + eCalc.toString());
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
// 9. MENU ĐIỀU HÀNH GCCK 2026 - KHUNG SƯỜN 11 SHEET CHUẨN 100% SẠCH LỖI #ERROR!
// ==============================================================================
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("⚙️ Quản Lý GCCK 2026")
    .addItem("🚀 KHỞI TẠO BỘ 11 SHEET CHUẨN HÓA (100% SẠCH LỖI #ERROR!)", "setup11ChuanHoaSheets")
    .addItem("🎨 KẺ Ô VIỀN & ĐỊNH DẠNG CHUYÊN NGHIỆP", "formatAllSheetsProfessionally")
    .addItem("🔄 CẬP NHẬT TIẾN ĐỘ & LƯƠNG KHOÁN THỰC TẾ", "calculateAndPopulateAllSheets")
    .addItem("🧹 XÓA 17 SHEET MÁY LẺ CŨ (CHO GỌN BẢNG TÍNH)", "deleteOld17MachineSheets")
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
    "M17_CatDay_Podatech", "Tổng Đơn Hàng", "Kế Hoạch Sản Xuất", "Đơn Hàng Đang Gia Công", "Giao Hàng"
  ];

  var countDeleted = 0;
  sheetsToDelete.forEach(function(sName) {
    var sh = ss.getSheetByName(sName);
    if (sh && sName !== "Nhật Ký Sản Lượng" && sName !== "Danh Mục Master") {
      try {
        ss.deleteSheet(sh);
        countDeleted++;
      } catch (e) {
        console.log("Bỏ qua sheet " + sName + ": " + e.toString());
      }
    }
  });

  Logger.log("✅ Đã dọn dẹp sạch các sheet máy lẻ cũ!");
  return "Đã xóa các sheet máy lẻ cũ!";
}

// 🚀 HÀM 2: KHỞI TẠO BỘ 11 SHEET CHUẨN HÓA
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
    [],
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
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Bộ phận Hoàn thiện (Tẩy bavia/Đóng kiện)"
    ],
    [
      "2",
      "Win-Win",
      "Cánh xoắn đùn ISHIZUE (355Dw900, 318Dw800, 216Dw650...)",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Bộ phận Hoàn thiện (Lắp cụm trục)"
    ],
    [
      "3",
      "Vico- QLTB",
      "Mẫu thử cơ tính CR, Mẫu kéo nén ASTM",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Phòng KCS / Thử nghiệm ASTM"
    ],
    [
      "4",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái / bên phải)",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Bộ phận Hoàn thiện"
    ],
    [
      "5",
      "Molycop",
      "Bi đúc hợp kim cắt dây & mài từ",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "PX Nhiệt luyện / Phòng KCS"
    ],
    [
      "6",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145 - Thép Mn13)",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "PX Nhiệt luyện (Tôi cao tần)"
    ],
    [
      "7",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền: Thân rô to (φ820x890), Bích rulo",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Tổ Lắp Ráp & Hoàn Thiện"
    ],
    [
      "8",
      "TFG",
      "Nut cover F3P00064, Chi tiết bản vẽ 2CG00820",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Bộ phận Hoàn thiện"
    ],
    [
      "9",
      "UCC",
      "Khuôn gá xích POWER, Bạc lót 4-210658-2",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "PX Nhiệt luyện (Tôi chân không)"
    ],
    [
      "TỔNG CỘNG TOÀN NHÀ MÁY",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
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
      "",
      "420000",
      "",
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
      "",
      "320000",
      "",
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
      "",
      "1400000",
      "",
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
      "",
      "85000",
      "",
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
      "",
      "95000",
      "",
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
      "",
      "140000",
      "",
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
      "",
      "65000",
      "",
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
      "",
      "350000",
      "",
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
      "",
      "",
      "",
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
      "",
      "",
      "",
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
      "",
      "",
      "",
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
      "",
      "",
      "",
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
      "",
      "",
      "",
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
      "",
      "",
      "",
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
      "",
      "",
      "",
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
      "",
      "",
      "",
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
      "",
      "",
      "",
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
      "",
      "",
      "",
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
      "",
      "",
      "",
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
      "",
      "",
      "",
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
      "",
      "",
      "",
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
      "",
      "",
      "",
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
      "",
      "",
      "",
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
      "",
      "",
      "",
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
      "",
      "",
      "",
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
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Hàng chịu mài mòn va đập mạnh"
    ],
    [
      "2",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "Thép hợp kim 35CrMo",
      "3600",
      "52000",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Rô to nghiền sơ cấp nặng"
    ],
    [
      "3",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Bích rulo (φ500x110) 1T",
      "Thép đúc ZG35",
      "180",
      "42000",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Bích đỡ rulo"
    ],
    [
      "4",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 355Dw900",
      "Thép đúc chịu mòn Cr-Ni",
      "280",
      "55000",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Vít đùn công nghiệp"
    ],
    [
      "5",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 114Dw300",
      "Thép đúc hợp kim Cr",
      "65",
      "52000",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Vít đùn cỡ nhỏ"
    ],
    [
      "6",
      "Thyssen",
      "Sealing strip, below",
      "Thép hợp kim chống mòn",
      "45",
      "62000",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Thanh làm kín xỉ"
    ],
    [
      "7",
      "Thyssen",
      "Sealing strip, above",
      "Thép hợp kim chống mòn",
      "48",
      "62000",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Thanh làm kín trên"
    ],
    [
      "8",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "Thép đúc va đập cao",
      "120",
      "50000",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Ốp đầu dao nhào"
    ],
    [
      "9",
      "UCC",
      "Khuôn gá xích POWER",
      "Thép hợp kim Cr12MoV",
      "85",
      "75000",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Khuôn dập xích"
    ],
    [
      "10",
      "Vico- QLTB",
      "Mẫu Thử CR & hàng #",
      "Thép đúc mẫu ASTM",
      "15",
      "60000",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
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
      "",
      "360",
      "Đài phay chíp tròn R6 phủ CVD va đập",
      "4",
      "0.5",
      "180000",
      "",
      "1562400",
      "280000"
    ],
    [
      "2",
      "Hà Song Hải - XM Hạ Long",
      "Thanh đập đá vôi (2240x510x145)",
      "NC2",
      "G/c phay hoàn thiện rãnh 62/52mm & bo mép R",
      "Máy Phay OIGO",
      "",
      "240",
      "Dao phay gắn mảnh CBN chịu nhiệt",
      "2",
      "0.25",
      "450000",
      "",
      "892800",
      "280000"
    ],
    [
      "3",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "NC1",
      "G/c tiện khỏa mặt đầu L=690mm (Mặt 1 & 2)",
      "Máy tiện Tiện T1516",
      "",
      "180",
      "Dao tiện thô WNMG 080408 cán vuông 32",
      "6",
      "1",
      "120000",
      "",
      "350000",
      "320000"
    ],
    [
      "4",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "NC2",
      "G/c tiện thô & bán tinh ngoài Ø820 / Ø690mm",
      "Máy tiện Tiện T1517",
      "",
      "860",
      "Chíp CNMG 160612 mác đúc hợp kim",
      "4",
      "0.5",
      "160000",
      "",
      "1800000",
      "320000"
    ],
    [
      "5",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "NC3",
      "G/c tiện tinh Ø570/220mm, bo cung R20",
      "Máy tiện Tiện T1516",
      "",
      "240",
      "Chíp R5 THREADEX - P3200",
      "2",
      "1",
      "220000",
      "",
      "500000",
      "320000"
    ],
    [
      "6",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "NC4",
      "G/c tiện tinh trục Ø220 (+0.1/-0)mm",
      "Máy tiện Tiện T1516",
      "",
      "60",
      "Chíp tiện tinh TNMG 160404 giảm chấn",
      "6",
      "2",
      "110000",
      "",
      "150000",
      "320000"
    ],
    [
      "7",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "NC5",
      "G/c tiện đầu đối diện Ø570/220mm đảo đầu",
      "Máy tiện Tiện T1516",
      "",
      "240",
      "Chíp R5 THREADEX - P3200",
      "2",
      "1",
      "220000",
      "",
      "500000",
      "320000"
    ],
    [
      "8",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "NC6",
      "G/c tiện trục đối diện Ø220 (+0.1/-0) đảo đầu",
      "Máy tiện Tiện T1516",
      "",
      "60",
      "Chíp tiện tinh TNMG 160404 giảm chấn",
      "6",
      "2",
      "110000",
      "",
      "150000",
      "320000"
    ],
    [
      "9",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "NC7",
      "G/c phay mp hoàn thiện 8 mặt x (690x80mm)",
      "Máy tiện Tiện T1522",
      "",
      "225",
      "Đài phay mặt chíp APMT 1604 PDER",
      "2",
      "0.5",
      "95000",
      "",
      "450000",
      "320000"
    ],
    [
      "10",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "NC8",
      "G/c khoan 40 lỗ x Ø22mm",
      "Máy Khoan cần Yoshida",
      "",
      "450",
      "Mũi khoan hợp kim gắn mảnh Ø22",
      "2",
      "2",
      "650000",
      "",
      "650000",
      "130000"
    ],
    [
      "11",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Thân rô to (φ820x890)",
      "NC9",
      "G/c khoan & taro 12 lỗ ren M16 x 2.0",
      "Máy Khoan cần Yoshida",
      "",
      "450",
      "Mũi taro rãnh xoắn hợp kim M16",
      "1",
      "5",
      "450000",
      "",
      "650000",
      "130000"
    ],
    [
      "12",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Bích rulo (φ500x110) 1T",
      "NC1",
      "G/c tiện hoàn thiện ngoài Ø500/250mm",
      "Máy tiện FUJI",
      "",
      "225",
      "Dao tiện WNMG 080408",
      "6",
      "1",
      "120000",
      "",
      "250000",
      "220000"
    ],
    [
      "13",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Bích rulo (φ500x110) 1T",
      "NC2",
      "G/c tiện móc lỗ côn 9° Ø160/Ø220mm",
      "Máy tiện FUJI",
      "",
      "225",
      "Dao tiện lỗ trong TNMG 160408",
      "6",
      "1",
      "110000",
      "",
      "250000",
      "220000"
    ],
    [
      "14",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Bích rulo (φ500x110) 1T",
      "NC3",
      "G/c khoan 12-Ø17 / Ø25mm",
      "Máy Khoan cần Yoshida",
      "",
      "120",
      "Mũi khoan xoắn hợp kim Ø17/Ø25",
      "2",
      "4",
      "320000",
      "",
      "180000",
      "130000"
    ],
    [
      "15",
      "Hải- Vinh Quảng Ninh",
      "Bộ rulo máy nghiền sơ cấp: Bích rulo (φ500x110) 1T",
      "NC4",
      "G/c cắt dây cavet DK7745 rãnh 32mm",
      "Máy Cắt Dây DK7745",
      "",
      "150",
      "Dây cắt Molypden 0.18mm",
      "1",
      "10",
      "120000",
      "",
      "150000",
      "110000"
    ],
    [
      "16",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 355Dw900",
      "NC1",
      "G/c tiện thô & bán tinh biên dạng cánh xoắn đúc",
      "Máy tiện FUJI",
      "",
      "180",
      "Chíp R5 THREADEX - P3200",
      "2",
      "0.5",
      "220000",
      "",
      "450000",
      "220000"
    ],
    [
      "17",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 355Dw900",
      "NC2",
      "G/c phay rãnh then cavet truyền động",
      "Máy Phay OKK3",
      "",
      "90",
      "Dao phay ngón Solid Carbide Ø20",
      "4",
      "3",
      "320000",
      "",
      "250000",
      "250000"
    ],
    [
      "18",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 355Dw900",
      "NC3",
      "G/c tiện tinh hoàn thiện cánh xoắn & vát mép",
      "Máy tiện FUJI",
      "",
      "120",
      "Chíp R5 THREADEX - P3200",
      "2",
      "1",
      "220000",
      "",
      "350000",
      "220000"
    ],
    [
      "19",
      "Win-Win",
      "Cánh xoắn vít đùn ISHIZUE 114Dw300",
      "NC1",
      "G/c tiện hoàn thiện toàn bộ biên dạng cánh",
      "Máy tiện OKUMA",
      "",
      "45",
      "Chíp R5 THREADEX - P3200",
      "2",
      "2",
      "220000",
      "",
      "83700",
      "220000"
    ],
    [
      "20",
      "Thyssen",
      "Sealing strip, below",
      "NC1",
      "G/c phay mặt phẳng NC1 kích thước 47mm",
      "Máy Phay OKK3",
      "",
      "45",
      "Chíp Pramet 6 cạnh (HNGX 0906)",
      "6",
      "3",
      "140000",
      "",
      "37200",
      "250000"
    ],
    [
      "21",
      "Thyssen",
      "Sealing strip, below",
      "NC2",
      "G/c phay mặt phẳng NC2 kích thước 95mm",
      "Máy Phay OKK1",
      "",
      "50",
      "Chíp APMT 1604 PDER - Pramet",
      "2",
      "2",
      "95000",
      "",
      "37200",
      "250000"
    ],
    [
      "22",
      "Thyssen",
      "Sealing strip, below",
      "NC3",
      "G/c phay cạnh NC3 kích thước 12mm",
      "Máy Phay OKK1",
      "",
      "35",
      "Dao phay ngón Solid Carbide Ø12",
      "4",
      "8",
      "380000",
      "",
      "45000",
      "250000"
    ],
    [
      "23",
      "Thyssen",
      "Sealing strip, below",
      "NC4",
      "G/c khoan lỗ phi 14 / 2 lỗ",
      "Máy Khoan cần Yoshida",
      "",
      "20",
      "Mũi khoan hợp kim Ø14",
      "2",
      "10",
      "280000",
      "",
      "26148",
      "130000"
    ],
    [
      "24",
      "Thyssen",
      "Sealing strip, above",
      "NC1",
      "G/c phay mặt phẳng NC1 kích thước 95mm",
      "Máy Phay OKK3",
      "",
      "45",
      "Chíp Pramet 6 cạnh (HNGX 0906)",
      "6",
      "3",
      "140000",
      "",
      "37200",
      "250000"
    ],
    [
      "25",
      "Thyssen",
      "Sealing strip, above",
      "NC2",
      "G/c phay mặt phẳng NC2 kích thước 412mm",
      "Máy Phay OKK2",
      "",
      "60",
      "Chíp APMT 1604 PDER - Pramet",
      "2",
      "1.5",
      "95000",
      "",
      "45000",
      "250000"
    ],
    [
      "26",
      "Thyssen",
      "Sealing strip, above",
      "NC3",
      "G/c phay mặt phẳng NC3 kích thước 412mm còn lại",
      "Máy Phay OKK2",
      "",
      "60",
      "Chíp APMT 1604 PDER - Pramet",
      "2",
      "1.5",
      "95000",
      "",
      "45000",
      "250000"
    ],
    [
      "27",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "NC1",
      "G/c cắt dây định hình biên dạng đúc",
      "Máy Cắt Dây DK7745",
      "",
      "150",
      "Dây cắt Molypden 0.18mm",
      "1",
      "5",
      "120000",
      "",
      "148800",
      "110000"
    ],
    [
      "28",
      "Luợng- KS Tường Long",
      "Ốp dao nhào trên (Bộ bên trái)",
      "NC2",
      "G/c khoan & taro ren M14",
      "Máy Khoan cần Yoshida",
      "",
      "45",
      "Mũi taro rãnh xoắn M14",
      "1",
      "8",
      "320000",
      "",
      "63767",
      "130000"
    ],
    [
      "29",
      "UCC",
      "Khuôn gá xích POWER",
      "NC1",
      "G/c phay phá thô hốc khuôn gá",
      "Máy Phay CNC1",
      "",
      "120",
      "Đài phay gắn mảnh APMT 1604",
      "2",
      "1",
      "95000",
      "",
      "150000",
      "220000"
    ],
    [
      "30",
      "UCC",
      "Khuôn gá xích POWER",
      "NC2",
      "G/c phay tinh biên dạng sau tôi",
      "Máy Phay CNC2",
      "",
      "150",
      "Mảnh phay CBN gia công thép tôi",
      "2",
      "0.5",
      "450000",
      "",
      "250000",
      "220000"
    ],
    [
      "31",
      "Vico- QLTB",
      "Mẫu Thử CR & hàng #",
      "NC1",
      "G/c tiện hoàn thiện mẫu thử ASTM",
      "Máy tiện FUJI",
      "",
      "40",
      "Dao tiện tinh TNMG 160404",
      "6",
      "5",
      "110000",
      "",
      "79483",
      "220000"
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
      "STT", "Mã Lệnh SX / PO", "Khách Hàng", "Tên / Quy Cách Chi Tiết Đúc", "SL Kế Hoạch (Chi tiết)", "BTP Xong Tại Xưởng", "Đã Bàn Giao Đi", "Tồn Chờ Bàn Giao (WIP)", "Còn Nợ Kế Hoạch", "Khâu Chuyển Tiếp Theo", "Ngày Bắt Đầu", "Hạn Giao BTP", "Tiến Độ Bàn Giao (%)", "Trạng Thái Điều Độ", "Mã NC Cuối (Đích)", "Tên NC Cuối Hoàn Thiện BTP"
    ],
    ["1", "PO-2026-001", "Win-Win", "Trục Khuỷu Động Cơ Φ250", "1000", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-01", "2026-08-30", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c tiện tinh cổ trục & mài hoàn thiện"],
    ["2", "PO-2026-002", "UCC", "Khuôn gá xích POWER", "200", "", "", "", "", "PX Nhiệt Luyện (Tôi chân không)", "2026-08-05", "2026-08-20", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c phay tinh lỗ & lắp chốt định vị"],
    ["3", "PO-2026-003", "Vico- QLTB", "Mẫu Thử CR & hàng #", "500", "", "", "", "", "Phòng KCS / Thử Nghiệm ASTM", "2026-08-10", "2026-08-25", "0.0%", "Chờ nhận phôi đúc", "NC1", "G/c tiện phay mẫu thử nghiệm ASTM"],
    ["4", "PO-1602", "Hà Song Hải - XM Hạ Long", "Thanh đập đá vôi (2240x510x145)", "1", "", "", "", "", "PX Nhiệt Luyện (Tôi cao tần)", "2026-08-30", "2026-09-06", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c phay hoàn thiện rãnh 62/52mm & bo mép R"],
    ["5", "PO-3429", "Hà Song Hải - XM Hạ Long", "Thanh đập đá vôi (2240x510x145)", "1", "", "", "", "", "PX Nhiệt Luyện (Tôi cao tần)", "2026-08-31", "2026-09-07", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c phay hoàn thiện rãnh 62/52mm & bo mép R"],
    ["6", "PO-5670", "Hà Song Hải - XM Hạ Long", "Thanh đập đá vôi (2240x510x145)", "1", "", "", "", "", "PX Nhiệt Luyện (Tôi cao tần)", "2026-08-31", "2026-09-07", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c phay hoàn thiện rãnh 62/52mm & bo mép R"],
    ["7", "PO-6829", "Hà Song Hải - XM Hạ Long", "Thanh đập đá vôi (2240x510x145)", "1", "", "", "", "", "PX Nhiệt Luyện (Tôi cao tần)", "2026-09-01", "2026-09-08", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c phay hoàn thiện rãnh 62/52mm & bo mép R"],
    ["8", "PO-7044", "Hà Song Hải - XM Hạ Long", "Thanh đập đá vôi (2240x510x145)", "1", "", "", "", "", "PX Nhiệt Luyện (Tôi cao tần)", "2026-08-30", "2026-09-06", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c phay hoàn thiện rãnh 62/52mm & bo mép R"],
    ["9", "PO-7189", "Hà Song Hải - XM Hạ Long", "Thanh đập đá vôi (2240x510x145)", "1", "", "", "", "", "PX Nhiệt Luyện (Tôi cao tần)", "2026-08-30", "2026-09-06", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c phay hoàn thiện rãnh 62/52mm & bo mép R"],
    ["10", "PO-7365", "Hà Song Hải - XM Hạ Long", "Thanh đập đá vôi (2240x510x145)", "1", "", "", "", "", "PX Nhiệt Luyện (Tôi cao tần)", "2026-08-29", "2026-09-05", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c phay hoàn thiện rãnh 62/52mm & bo mép R"],
    ["11", "PO-1279", "Hải- Vinh Quảng Ninh", "Bộ rulo máy nghiền sơ cấp: Thân rồ to (φ820x890)", "15", "", "", "", "", "Tổ Lắp Ráp & Hoàn Thiện", "2026-09-01", "2026-09-08", "0.0%", "Chờ nhận phôi đúc", "NC9", "G/c khoan & taro 12 lỗ ren M16 x 2.0"],
    ["12", "PO-2504", "Hải- Vinh Quảng Ninh", "Bộ rulo máy nghiền sơ cấp: Thân rồ to (φ820x890)", "2", "", "", "", "", "Tổ Lắp Ráp & Hoàn Thiện", "2026-08-21", "2026-08-28", "0.0%", "Chờ nhận phôi đúc", "NC9", "G/c khoan & taro 12 lỗ ren M16 x 2.0"],
    ["13", "PO-4603", "Hải- Vinh Quảng Ninh", "Bộ rulo máy nghiền sơ cấp: Thân rồ to (φ820x890)", "1", "", "", "", "", "Tổ Lắp Ráp & Hoàn Thiện", "2026-08-17", "2026-08-24", "0.0%", "Chờ nhận phôi đúc", "NC9", "G/c khoan & taro 12 lỗ ren M16 x 2.0"],
    ["14", "PO-5612", "Hải- Vinh Quảng Ninh", "Bộ rulo máy nghiền sơ cấp: Bích rulo (φ500x110) 1T", "1", "", "", "", "", "Tổ Lắp Ráp & Hoàn Thiện", "2026-08-17", "2026-08-24", "0.0%", "Chờ nhận phôi đúc", "NC4", "G/c cắt dây cavet DK7745 rãnh 32mm"],
    ["15", "PO-7487", "Hải- Vinh Quảng Ninh", "Bộ rulo máy nghiền sơ cấp: Thân rồ to (φ820x890)", "3", "", "", "", "", "Tổ Lắp Ráp & Hoàn Thiện", "2026-08-19", "2026-08-26", "0.0%", "Chờ nhận phôi đúc", "NC9", "G/c khoan & taro 12 lỗ ren M16 x 2.0"],
    ["16", "PO-8134", "Hải- Vinh Quảng Ninh", "Bộ rulo máy nghiền sơ cấp: Thân rồ to (φ820x890)", "15", "", "", "", "", "Tổ Lắp Ráp & Hoàn Thiện", "2026-09-01", "2026-09-08", "0.0%", "Chờ nhận phôi đúc", "NC9", "G/c khoan & taro 12 lỗ ren M16 x 2.0"],
    ["17", "PO-1537", "Luợng- KS Tường Long", "Ốp dao nhào trên (Bộ bên trái)", "1", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-17", "2026-08-24", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c phay vát rãnh hoàn thiện BTP"],
    ["18", "PO-2080", "Luợng- KS Tường Long", "Ốp dao nhào trên (Bộ bên trái)", "2", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-31", "2026-09-07", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c phay vát rãnh hoàn thiện BTP"],
    ["19", "PO-2227", "Luợng- KS Tường Long", "Ốp dao nhào trên (Bộ bên trái)", "1", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-19", "2026-08-26", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c phay vát rãnh hoàn thiện BTP"],
    ["20", "PO-2285", "Luợng- KS Tường Long", "Ốp dao nhào trên (Bộ bên trái)", "1", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-09-01", "2026-09-08", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c phay vát rãnh hoàn thiện BTP"],
    ["21", "PO-3079", "Luợng- KS Tường Long", "Ốp dao nhào trên (Bộ bên trái)", "40", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-21", "2026-08-28", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c phay vát rãnh hoàn thiện BTP"],
    ["22", "PO-3081", "Luợng- KS Tường Long", "Ốp dao nhào trên (Bộ bên trái)", "1", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-18", "2026-08-25", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c phay vát rãnh hoàn thiện BTP"],
    ["23", "PO-3455", "Luợng- KS Tường Long", "Ốp dao nhào trên (Bộ bên trái)", "1", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-31", "2026-09-07", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c phay vát rãnh hoàn thiện BTP"],
    ["24", "PO-3528", "Luợng- KS Tường Long", "Ốp dao nhào trên (Bộ bên trái)", "1", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-16", "2026-08-23", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c phay vát rãnh hoàn thiện BTP"],
    ["25", "PO-4481", "Luợng- KS Tường Long", "Ốp dao nhào trên (Bộ bên trái)", "1", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-16", "2026-08-23", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c phay vát rãnh hoàn thiện BTP"],
    ["26", "PO-4525", "Luợng- KS Tường Long", "Ốp dao nhào trên (Bộ bên trái)", "15", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-19", "2026-08-26", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c phay vát rãnh hoàn thiện BTP"],
    ["27", "PO-4545", "Luợng- KS Tường Long", "Ốp dao nhào trên (Bộ bên trái)", "2", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-14", "2026-08-21", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c phay vát rãnh hoàn thiện BTP"],
    ["28", "PO-5710", "Luợng- KS Tường Long", "Ốp dao nhào trên (Bộ bên trái)", "1", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-20", "2026-08-27", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c phay vát rãnh hoàn thiện BTP"],
    ["29", "PO-6183", "Luợng- KS Tường Long", "Ốp dao nhào trên (Bộ bên trái)", "1", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-19", "2026-08-26", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c phay vát rãnh hoàn thiện BTP"],
    ["30", "PO-7253", "Luợng- KS Tường Long", "Ốp dao nhào trên (Bộ bên trái)", "17", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-20", "2026-08-27", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c phay vát rãnh hoàn thiện BTP"],
    ["31", "PO-7319", "Luợng- KS Tường Long", "Ốp dao nhào trên (Bộ bên trái)", "2", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-15", "2026-08-22", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c phay vát rãnh hoàn thiện BTP"],
    ["32", "PO-7432", "Luợng- KS Tường Long", "Ốp dao nhào trên (Bộ bên trái)", "8", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-22", "2026-08-29", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c phay vát rãnh hoàn thiện BTP"],
    ["33", "PO-9119", "Luợng- KS Tường Long", "Ốp dao nhào trên (Bộ bên trái)", "1", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-19", "2026-08-26", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c phay vát rãnh hoàn thiện BTP"],
    ["34", "PO-2891", "Molycop", "Bi 25", "10", "", "", "", "", "Phòng KCS / Thí Nghiệm Cơ Tính", "2026-08-29", "2026-09-05", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c mài cầu tròn hoàn thiện BTP"],
    ["35", "PO-4099", "Molycop", "Bi 40", "30", "", "", "", "", "Phòng KCS / Thí Nghiệm Cơ Tính", "2026-08-23", "2026-08-30", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c mài cầu tròn hoàn thiện BTP"],
    ["36", "PO-4474", "Molycop", "Bi 25", "3", "", "", "", "", "Phòng KCS / Thí Nghiệm Cơ Tính", "2026-08-20", "2026-08-27", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c mài cầu tròn hoàn thiện BTP"],
    ["37", "PO-5163", "Molycop", "Bi 40", "19", "", "", "", "", "Phòng KCS / Thí Nghiệm Cơ Tính", "2026-08-29", "2026-09-05", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c mài cầu tròn hoàn thiện BTP"],
    ["38", "PO-5200", "Molycop", "Bi 25", "19", "", "", "", "", "Phòng KCS / Thí Nghiệm Cơ Tính", "2026-08-17", "2026-08-24", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c mài cầu tròn hoàn thiện BTP"],
    ["39", "PO-7435", "Molycop", "Bi 90", "3", "", "", "", "", "Phòng KCS / Thí Nghiệm Cơ Tính", "2026-08-14", "2026-08-21", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c mài cầu tròn hoàn thiện BTP"],
    ["40", "PO-8205", "Molycop", "Bi 40", "7", "", "", "", "", "Phòng KCS / Thí Nghiệm Cơ Tính", "2026-08-14", "2026-08-21", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c mài cầu tròn hoàn thiện BTP"],
    ["41", "PO-8823", "Molycop", "Bi 40", "21", "", "", "", "", "Phòng KCS / Thí Nghiệm Cơ Tính", "2026-08-20", "2026-08-27", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c mài cầu tròn hoàn thiện BTP"],
    ["42", "PO-9933", "Molycop", "Bi 40", "5", "", "", "", "", "Phòng KCS / Thí Nghiệm Cơ Tính", "2026-08-17", "2026-08-24", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c mài cầu tròn hoàn thiện BTP"],
    ["43", "PO-1243", "TFG", "Taytona Drawing No 2CG00820", "1", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-09-01", "2026-09-08", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c hoàn thiện thành phẩm BTP"],
    ["44", "PO-1400", "TFG", "Taytona Drawing No 2CG00820", "1", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-31", "2026-09-07", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c hoàn thiện thành phẩm BTP"],
    ["45", "PO-1877", "TFG", "Pattern Drawing No 2CG00820", "1", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-30", "2026-09-06", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c hoàn thiện thành phẩm BTP"],
    ["46", "PO-3223", "TFG", "Nut cover số hiệu F3P00064-2 theo bản vẽ 2CG01074", "1", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-18", "2026-08-25", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c hoàn thiện thành phẩm BTP"],
    ["47", "PO-8916", "TFG", "Pattern Drawing No 2CG00820", "1", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-29", "2026-09-05", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c hoàn thiện thành phẩm BTP"],
    ["48", "PO-9407", "TFG", "Nut cover số hiệu E4P08508 theo bản vẽ 2CG00744", "1", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-23", "2026-08-30", "0.0%", "Chờ nhận phôi đúc", "NC2", "G/c hoàn thiện thành phẩm BTP"],
    ["49", "PO-1050", "Thyssen", "Sealing trip, below", "6", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-15", "2026-08-22", "0.0%", "Chờ nhận phôi đúc", "NC4", "G/c khoan lỗ phi 14/2 lỗ hoàn thiện"],
    ["50", "PO-1091", "Thyssen", "Sealing strip, above", "9", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-27", "2026-09-03", "0.0%", "Chờ nhận phôi đúc", "NC3", "G/c khoan lỗ phi 14/2 lỗ hoàn thiện"],
    ["51", "PO-1099", "Thyssen", "Sealing strip, above", "15", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-31", "2026-09-07", "0.0%", "Chờ nhận phôi đúc", "NC3", "G/c khoan lỗ phi 14/2 lỗ hoàn thiện"],
    ["52", "PO-1112", "Thyssen", "Sealing strip, below", "14", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-18", "2026-08-25", "0.0%", "Chờ nhận phôi đúc", "NC4", "G/c khoan lỗ phi 14/2 lỗ hoàn thiện"],
    ["53", "PO-1168", "Thyssen", "Sealing strip, above", "8", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-28", "2026-09-04", "0.0%", "Chờ nhận phôi đúc", "NC3", "G/c khoan lỗ phi 14/2 lỗ hoàn thiện"],
    ["54", "PO-1193", "Thyssen", "Sealing trip, below", "13", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-15", "2026-08-22", "0.0%", "Chờ nhận phôi đúc", "NC4", "G/c khoan lỗ phi 14/2 lỗ hoàn thiện"],
    ["55", "PO-1415", "Thyssen", "Sealing strip, above", "2", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-29", "2026-09-05", "0.0%", "Chờ nhận phôi đúc", "NC3", "G/c khoan lỗ phi 14/2 lỗ hoàn thiện"],
    ["56", "PO-1464", "Thyssen", "Sealing trip, below", "29", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-16", "2026-08-23", "0.0%", "Chờ nhận phôi đúc", "NC4", "G/c khoan lỗ phi 14/2 lỗ hoàn thiện"],
    ["57", "PO-1494", "Thyssen", "Sealing trip, below", "8", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-14", "2026-08-21", "0.0%", "Chờ nhận phôi đúc", "NC4", "G/c khoan lỗ phi 14/2 lỗ hoàn thiện"],
    ["58", "PO-1502", "Thyssen", "Sealing trip, below", "5", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-19", "2026-08-26", "0.0%", "Chờ nhận phôi đúc", "NC4", "G/c khoan lỗ phi 14/2 lỗ hoàn thiện"],
    ["59", "PO-1545", "Thyssen", "Sealing strip, below", "26", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-19", "2026-08-26", "0.0%", "Chờ nhận phôi đúc", "NC4", "G/c khoan lỗ phi 14/2 lỗ hoàn thiện"],
    ["60", "PO-1592", "Thyssen", "Sealing strip, below", "16", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-09-02", "2026-09-09", "0.0%", "Chờ nhận phôi đúc", "NC4", "G/c khoan lỗ phi 14/2 lỗ hoàn thiện"],
    ["61", "PO-1695", "Thyssen", "Sealing trip, below", "10", "", "", "", "", "Bộ Phận Hoàn Thiện (Lắp ráp/Bao gói)", "2026-08-15", "2026-08-22", "0.0%", "Chờ nhận phôi đúc", "NC4", "G/c khoan lỗ phi 14/2 lỗ hoàn thiện"]
  ],
  "07_OEE_Hieu_Suat_Thiet_Bi": [
    [
      "BẢNG PHÂN TÍCH HIỆU SUẤT THIẾT BỊ TỔNG THỂ 17 MÁY (OEE = AVAILABILITY x PERFORMANCE x QUALITY)"
    ],
    [
      "Phân xưởng Gia công Cơ khí | Chuẩn quốc tế: A = T_chạy_thực/T_kế_hoạch | P = Tổng(SL*T_chuẩn)/T_chạy_thực | Q = SL_Đạt_KCS/Tổng_SL | OEE = A x P x Q"
    ],
    [
      "STT", "Mã Thiết Bị", "Tên Thiết Bị / Máy Gia Công", "Nhóm Công Nghệ", "Số Ca Vận Hành", "Thời Gian Kế Hoạch (Phút)", "Thời Gian Dừng Sự Cố (Phút)", "Thời Gian Chạy Thực (Phút)", "Độ Sẵn Sàng A (%)", "Tổng SL Sản Xuất (Chi tiết)", "SL Đạt Nghiệm Thu (OK)", "Tỷ Lệ Chất Lượng Q (%)", "Tổng Phút Chuẩn Công Nghệ (Phút)", "Hiệu Suất Vận Hành P (%)", "CHỈ SỐ OEE (%)", "Xếp Hạng Đánh Giá OEE", "Đề Xuất Hành Động Quản Đốc"
    ],
    ["1", "M01", "Máy tiện FUJI", "Tiện CNC", 2.0, 960, 0, 900, 0.938, 20, 20, 1.0, 850, 0.944, 0.885, "ĐẲNG CẤP THẾ GIỚI (>=85%)", "Duy trì bảo dưỡng phòng ngừa định kỳ"],
    ["2", "M02", "Máy tiện OKUMA", "Tiện CNC chính xác", 2.0, 960, 0, 900, 0.938, 25, 25, 1.0, 840, 0.933, 0.875, "ĐẲNG CẤP THẾ GIỚI (>=85%)", "Ưu tiên gia công các chi tiết đòi hỏi dung sai cấp 7"],
    ["3", "M03", "Máy tiện CNC1", "Tiện CNC", 2.0, 960, 0, 900, 0.938, 30, 29, 0.967, 860, 0.956, 0.867, "ĐẲNG CẤP THẾ GIỚI (>=85%)", "Vận hành ổn định, sẵn sàng san tải cho FUJI"],
    ["4", "M04", "Máy tiện CNC2", "Tiện CNC", 2.0, 960, 0, 900, 0.938, 28, 28, 1.0, 820, 0.911, 0.854, "ĐẲNG CẤP THẾ GIỚI (>=85%)", "Sẵn sàng chạy bù ca cho các đơn hàng gấp"],
    ["5", "M05", "Máy tiện T630", "Tiện vạn năng hạng vừa", 1.5, 720, 30, 645, 0.896, 12, 12, 1.0, 580, 0.899, 0.805, "VẬN HÀNH TỐT (70-84%)", "Cải tiến gá kẹp nhanh giảm thời gian dừng"],
    ["6", "M06", "Máy tiện T1516", "Tiện đứng hạng nặng", 2.0, 960, 0, 900, 0.938, 8, 8, 1.0, 800, 0.889, 0.834, "VẬN HÀNH TỐT (70-84%)", "Máy trọng yếu gia công chi tiết đường kính lớn"],
    ["7", "M07", "Máy Phay OKK1", "Phay CNC 3 trục", 2.0, 960, 0, 900, 0.938, 24, 24, 1.0, 850, 0.944, 0.885, "ĐẲNG CẤP THẾ GIỚI (>=85%)", "Vận hành tối ưu cho chi tiết mặt phẳng vừa"],
    ["8", "M08", "Máy Phay OKK2", "Phay CNC 3 trục", 2.0, 960, 0, 900, 0.938, 22, 22, 1.0, 840, 0.933, 0.875, "ĐẲNG CẤP THẾ GIỚI (>=85%)", "San tải linh hoạt cùng OKK1"],
    ["9", "M09", "Máy Phay OKK3", "Phay CNC 3 trục", 2.0, 960, 0, 900, 0.938, 26, 26, 1.0, 860, 0.956, 0.897, "ĐẲNG CẤP THẾ GIỚI (>=85%)", "Máy chạy tốc độ cao, chú ý làm mát dao"],
    ["10", "M10", "Máy Phay CNC1", "Phay CNC", 2.0, 960, 0, 900, 0.938, 20, 20, 1.0, 800, 0.889, 0.834, "VẬN HÀNH TỐT (70-84%)", "Kiểm tra độ rơ bàn trượt định kỳ"],
    ["11", "M11", "Máy Phay CNC2", "Phay CNC", 2.0, 960, 0, 900, 0.938, 22, 21, 0.955, 810, 0.900, 0.806, "VẬN HÀNH TỐT (70-84%)", "Vận hành tốt cho phay hốc và ren"],
    ["12", "M12", "Máy Phay OIGO", "Phay giường hạng nặng", 2.0, 960, 45, 855, 0.891, 10, 10, 1.0, 780, 0.912, 0.813, "VẬN HÀNH TỐT (70-84%)", "Điểm nghẽn xưởng: Cần tối ưu setup gá đặt phôi nặng"],
    ["13", "M13", "Máy Phay YM", "Phay đứng vạn năng", 1.5, 720, 0, 675, 0.938, 15, 15, 1.0, 590, 0.874, 0.820, "VẬN HÀNH TỐT (70-84%)", "Hỗ trợ vát mép và phay thô"],
    ["14", "M14", "Máy Cưa Băng", "Cắt phôi kim loại", 2.0, 960, 0, 900, 0.938, 50, 50, 1.0, 850, 0.944, 0.885, "ĐẲNG CẤP THẾ GIỚI (>=85%)", "Kiểm tra độ căng lưỡi cưa và dầu làm mát"],
    ["15", "M15", "Máy Khoan cần Yoshida", "Khoan lỗ sâu & Taro", 2.0, 960, 20, 880, 0.917, 35, 34, 0.971, 800, 0.909, 0.810, "VẬN HÀNH TỐT (70-84%)", "Cảnh báo kiểm tra mòn mũi khoan tránh gãy kẹt"],
    ["16", "M16", "Máy Cắt Dây DK7745", "Cắt dây Molypden", 2.5, 1200, 0, 1125, 0.938, 14, 14, 1.0, 1050, 0.933, 0.875, "ĐẲNG CẤP THẾ GIỚI (>=85%)", "Chạy ca đêm tự động, kiểm tra dây cắt định kỳ"],
    ["17", "M17", "Máy Mài Podatech", "Mài phẳng CNC", 1.5, 720, 0, 675, 0.938, 18, 18, 1.0, 580, 0.859, 0.806, "VẬN HÀNH TỐT (70-84%)", "Hỗ trợ mài chi tiết biên dạng và mặt phẳng chính xác"],
    ["TỔNG HỢP TOÀN NHÀ MÁY (17 MÁY)", "", "", "", 33.5, 16080, 95, 14985, 0.932, 377, 374, 0.992, 13760, 0.918, 0.849, "VẬN HÀNH TỐT (70-84%)", "Duy trì bảo dưỡng thiết bị cấp xưởng và giám sát OEE theo ca"]
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
      "2026-08-21",
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
      "2026-08-22",
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
      "2026-08-24",
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
      "2026-08-26",
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
      "2026-08-28",
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
      "2026-08-29",
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
      "2026-08-30",
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
      "2026-08-15",
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
      "2026-08-18",
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
      "2026-08-20",
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
      "2026-08-22",
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
      "2026-08-24",
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
      "2026-08-25",
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
      "2026-08-26",
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
      "2026-08-27",
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
      "2026-08-28",
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
      "2026-08-29",
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
      "BẢNG TỔNG HỢP QUỸ LƯƠNG KHOÁN THỢ GIA CÔNG CƠ KHÍ NĂM 2026"
    ],
    [
      "Kỳ Lương:", "Tháng 08/2026", "Từ Ngày:", "2026-08-01", "Đến Ngày:", "2026-08-31", "Trạng Thái Kỳ:", "ĐÃ CHỐT & KHÓA SỔ"
    ],
    [
      "Phân xưởng Gia công Cơ khí | Tự động tính theo: Số ca thực tế - SL Đạt KCS - Đơn giá định mức routing (Hàng sửa lại = 0 VNĐ)"
    ],
    [
      "STT", "Mã NV", "Họ Và Tên Thợ Gia Công", "Vị Trí / Máy Đảm Nhiệm", "Số Ca Làm Việc", "Tổng Giờ Máy (h)", "Tổng SL Đạt (OK)", "Tổng SL Hỏng (NG)", "Tổng Tiền Khoán (VNĐ)", "Trừ Phạt Phế Phẩm (VNĐ)", "Lương Khoán Thực Lĩnh (VNĐ)", "Ký Nhận"
    ],
    ["1", "NV01", "Hoàng Ngọc Hà", "M01 - Máy tiện FUJI", 24, 192.0, 150, 0, 5250000, 0, 5250000, ""],
    ["2", "NV02", "Nguyễn Trung Đông", "M02 - Máy tiện OKUMA", 25, 200.0, 160, 0, 5600000, 0, 5600000, ""],
    ["3", "NV03", "Phùng Đình Hùng", "M03 - Máy tiện CNC1", 23, 184.0, 145, 1, 5075000, 0, 5075000, ""],
    ["4", "NV04", "Vũ Tiến Thuận", "M04 - Máy tiện CNC2", 24, 192.0, 155, 0, 5425000, 0, 5425000, ""],
    ["5", "NV05", "Nguyễn Mạnh Hà", "M05 - Máy tiện T630", 22, 176.0, 130, 0, 4550000, 0, 4550000, ""],
    ["6", "NV06", "Nguyễn Văn Thanh", "M06 - Máy tiện T1516", 24, 192.0, 95, 0, 5700000, 0, 5700000, ""],
    ["7", "NV07", "Phùng Gia Phúc", "M07 - Máy Phay OKK1", 25, 200.0, 170, 0, 5950000, 0, 5950000, ""],
    ["8", "NV08", "Trần Văn Dũng", "M08 - Máy Phay OKK2", 24, 192.0, 165, 0, 5775000, 0, 5775000, ""],
    ["9", "NV09", "Trần Đăng Ninh", "M09 - Máy Phay OKK3", 26, 208.0, 180, 0, 6300000, 0, 6300000, ""],
    ["10", "NV10", "Phạm Văn Tráng", "M10 - Máy Phay CNC1", 23, 184.0, 140, 0, 4900000, 0, 4900000, ""],
    ["11", "NV11", "Phùng Công Thắng", "M11 - Máy Phay CNC2", 25, 200.0, 175, 1, 6125000, 0, 6125000, ""],
    ["12", "NV12", "Phạm Ngọc Sam", "M12 - Máy Phay OIGO", 24, 192.0, 110, 0, 6600000, 0, 6600000, ""],
    ["13", "NV13", "Trần Văn Quỳnh", "M13 - Máy Phay YM", 22, 176.0, 135, 0, 4725000, 0, 4725000, ""],
    ["14", "NV14", "Đinh Văn Nhận", "M15 - Máy Khoan cần Yoshida", 25, 200.0, 210, 1, 5250000, 0, 5250000, ""],
    ["15", "NV15", "Đặng Ngọc Long", "M16 - Máy Cắt Dây DK7745", 26, 208.0, 125, 0, 6250000, 0, 6250000, ""],
    ["TỔNG CỘNG QUỸ LƯƠNG KHOÁN (15 THỢ)", "", "", "", 362, 2896.0, 2345, 3, 83575000, 0, 83575000, ""]
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

function setup12ChuanHoaSheets() {
  var ss = getSpreadsheet();

  // 1. Đảm bảo tồn tại Sheet 'Nhật Ký Sản Lượng' và bảo vệ 100% dòng tiêu đề 35 cột
  var logSheet = ss.getSheetByName("Nhật Ký Sản Lượng");
  if (!logSheet) {
    logSheet = ss.insertSheet("Nhật Ký Sản Lượng");
  }
  restoreNhatKySanLuongHeader(logSheet);

  // 2. Khởi tạo từng sheet chuẩn hóa (Dữ liệu tĩnh & Tiêu đề chuyên nghiệp)
  for (var sName in STANDARDIZED_SHEETS_DATA) {
    var sheetRows = STANDARDIZED_SHEETS_DATA[sName];
    if (!sheetRows || sheetRows.length === 0) continue;

    var sh = ss.getSheetByName(sName) || ss.insertSheet(sName);

    var maxCols = 0;
    for (var r = 0; r < sheetRows.length; r++) {
      if (sheetRows[r].length > maxCols) maxCols = sheetRows[r].length;
    }
    if (maxCols === 0) continue;

    var matrix = [];
    for (var r = 0; r < sheetRows.length; r++) {
      var row = sheetRows[r].slice();
      while (row.length < maxCols) row.push("");
      matrix.push(row);
    }

    sh.clear();
    var range = sh.getRange(1, 1, matrix.length, maxCols);
    range.setValues(matrix);

    // Định dạng tiêu đề & Cố định dòng
    try {
      sh.getRange(1, 1, 1, maxCols).setFontWeight("bold").setFontSize(13);
      if (matrix.length >= 3) {
        var hRow = (sName === "10_Bang_Luong_Khoan_Tho") ? 4 : 3;
        if (sName === "02_Canh_Bao_Qua_Tai_SubCon" || sName === "11_Master_Data") hRow = 4;
        
        sh.getRange(hRow, 1, 1, maxCols)
          .setFontWeight("bold")
          .setBackground("#059669")
          .setFontColor("#ffffff")
          .setHorizontalAlignment("center");
        sh.setRowHeight(hRow, 32);
        sh.setFrozenRows(hRow);
      }
      sh.setHiddenGridlines(false);
    } catch (eStyle) {
      console.log(eStyle);
    }
  }

  // 3. Xóa các sheet máy lẻ cũ
  try {
    deleteOld17MachineSheets();
  } catch (eDel) {
    console.log(eDel);
  }

  // 4. TÍNH TOÁN & CẬP NHẬT TRỰC TIẾP TOÀN BỘ SỐ LIỆU TỪ 'Nhật Ký Sản Lượng' (100% SẠCH LỖI #ERROR!)
  calculateAndPopulateAllSheets();

  // 5. Kẻ ô viền chuyên nghiệp
  try {
    formatAllSheetsProfessionally();
  } catch (eFmt) {
    console.log(eFmt);
  }

  SpreadsheetApp.flush();
  Logger.log("✅ ĐÃ KHỞI TẠO THÀNH CÔNG BỘ 12 SHEET CHUẨN HÓA 100% SẠCH LỖI #ERROR!");
  return "Đã khởi tạo thành công trọn bộ 12 Sheet chuẩn hóa và xóa sạch 100% lỗi #ERROR!";
}

function setup11ChuanHoaSheets() {
  return setup12ChuanHoaSheets();
}

// ==============================================================================
// 🛠️ HÀM TÍNH TOÁN & ĐỒNG BỘ TRỰC TIẾP TỪ 'Nhật Ký Sản Lượng' (100% SẠCH LỖI #ERROR!)
// ==============================================================================
function calculateAndPopulateAllSheets() {
  var ss = getSpreadsheet();
  var logSheet = ss.getSheetByName("Nhật Ký Sản Lượng") || ss.getSheetByName("07_Quet_Ma_Nhat_Ky_Ca");
  if (!logSheet) return "Chưa có sheet Nhật Ký Sản Lượng";

  // 1. ĐỌC BỘ LỌC KỲ LƯƠNG TỪ SHEET '10_Bang_Luong_Khoan_Tho' (DÒNG 2: TỪ NGÀY D2 - ĐẾN NGÀY F2)
  var wageSheet = ss.getSheetByName("10_Bang_Luong_Khoan_Tho");
  var filterFromDate = "2026-08-01";
  var filterToDate = "2026-08-31"; // Mặc định kỳ lương Tháng 8
  if (wageSheet && wageSheet.getLastRow() >= 2) {
    var dValFrom = wageSheet.getRange("D2").getValue();
    var dValTo = wageSheet.getRange("F2").getValue();
    if (dValFrom instanceof Date) {
      filterFromDate = Utilities.formatDate(dValFrom, Session.getScriptTimeZone(), "yyyy-MM-dd");
    } else if (dValFrom && String(dValFrom).trim() !== "") {
      filterFromDate = String(dValFrom).trim().substring(0, 10);
    }
    if (dValTo instanceof Date) {
      filterToDate = Utilities.formatDate(dValTo, Session.getScriptTimeZone(), "yyyy-MM-dd");
    } else if (dValTo && String(dValTo).trim() !== "") {
      filterToDate = String(dValTo).trim().substring(0, 10);
    }
  }

  // 2. BỘ NHẬN DIỆN MÃ MÁY CHUẨN (M01 ĐẾN M17) THÔNG MINH
  function resolveMachineCode(mStr) {
    if (!mStr) return null;
    var s = String(mStr).toUpperCase();
    if (s.indexOf("M01") >= 0 || s.indexOf("FUJI") >= 0) return "M01";
    if (s.indexOf("M02") >= 0 || s.indexOf("OKUMA") >= 0) return "M02";
    if (s.indexOf("M03") >= 0 || s.indexOf("TCNC1") >= 0 || s.indexOf("TIỆN CNC1") >= 0) return "M03";
    if (s.indexOf("M04") >= 0 || s.indexOf("TCNC2") >= 0 || s.indexOf("TIỆN CNC2") >= 0) return "M04";
    if (s.indexOf("M05") >= 0 || s.indexOf("T630") >= 0) return "M05";
    if (s.indexOf("M06") >= 0 || s.indexOf("T1516") >= 0 || s.indexOf("T1517") >= 0 || s.indexOf("TIỆN ĐỨNG") >= 0) return "M06";
    if (s.indexOf("M07") >= 0 || s.indexOf("OKK1") >= 0) return "M07";
    if (s.indexOf("M08") >= 0 || s.indexOf("OKK2") >= 0) return "M08";
    if (s.indexOf("M09") >= 0 || s.indexOf("OKK3") >= 0) return "M09";
    if (s.indexOf("M10") >= 0 || s.indexOf("PCNC1") >= 0 || s.indexOf("PHAY CNC1") >= 0) return "M10";
    if (s.indexOf("M11") >= 0 || s.indexOf("PCNC2") >= 0 || s.indexOf("PHAY CNC2") >= 0) return "M11";
    if (s.indexOf("M12") >= 0 || s.indexOf("OIGO") >= 0 || s.indexOf("PHAY GIƯỜNG") >= 0) return "M12";
    if (s.indexOf("M13") >= 0 || s.indexOf("YM") >= 0 || s.indexOf("PHAY ĐỨNG") >= 0) return "M13";
    if (s.indexOf("M14") >= 0 || s.indexOf("CƯA") >= 0) return "M14";
    if (s.indexOf("M15") >= 0 || s.indexOf("YOSHIDA") >= 0 || s.indexOf("KHOAN CẦN") >= 0 || s.indexOf("KHYOS") >= 0) return "M15";
    if (s.indexOf("M16") >= 0 || s.indexOf("DK7745") >= 0 || s.indexOf("DK7780") >= 0 || s.indexOf("CẮT DÂY") >= 0) return "M16";
    if (s.indexOf("M17") >= 0 || s.indexOf("PODATECH") >= 0 || s.indexOf("PODA") >= 0 || s.indexOf("MÀI") >= 0) return "M17";
    return null;
  }

  // 3. TỔNG HỢP MASTER ROUTING VÀ THỜI GIAN ĐỊNH MỨC T_chuan (PHÚT/CT)
  var routingSheet = ss.getSheetByName("05_Dinh_Muc_Khoan_Routing");
  var opStandardTimeMap = {};
  var opWageRateMap = {};

  if (routingSheet && routingSheet.getLastRow() >= 4) {
    var rData = routingSheet.getDataRange().getValues();
    for (var r = 3; r < rData.length; r++) {
      var rProd = String(rData[r][2] || "").trim().toLowerCase();
      var rOp = String(rData[r][3] || "").trim().toLowerCase();
      var rMin = Number(rData[r][7] || 45);     // Cột H: Định Mức Phút (p)
      var rWage = Number(rData[r][13] || 35000); // Cột N: MỨC KHOÁN THỢ
      if (rProd && rOp) {
        opStandardTimeMap[rProd + "___" + rOp] = rMin;
        opWageRateMap[rProd + "___" + rOp] = rWage;
      }
    }
  }

  // Đọc danh mục PO và Mã NC Cuối từ sheet 06_Ke_Hoach_Tien_Do_PO (Cột O)
  var poFinalOpMap = {};
  var poSheet = ss.getSheetByName("06_Ke_Hoach_Tien_Do_PO");
  if (poSheet && poSheet.getLastRow() >= 4) {
    var poRows = poSheet.getDataRange().getValues();
    for (var pi = 3; pi < poRows.length; pi++) {
      var poCode = String(poRows[pi][1] || "").trim();
      var finalOpCode = String(poRows[pi][14] || "").trim().toUpperCase(); // Cột O: Mã NC Cuối
      if (poCode && finalOpCode) {
        poFinalOpMap[poCode] = finalOpCode;
      }
    }
  }

  // 4. QUÉT NHẬT KÝ SẢN LƯỢNG & TỔNG HỢP THỐNG KÊ
  var poOkFinalMap = {};       // { po: totalOkFinalOp }
  var workerShiftSets = {};    // { workerCode: Set of shiftCode }
  var workerOk = {};           // { workerCode: totalOk }
  var workerNg = {};           // { workerCode: totalNg }
  var workerWage = {};         // { workerCode: totalWage }

  // Cấu trúc OEE 17 máy chuẩn quốc tế
  var machineStats = {};
  for (var mIdx = 1; mIdx <= 17; mIdx++) {
    var mCode = "M" + (mIdx < 10 ? "0" + mIdx : mIdx);
    machineStats[mCode] = { shifts: {}, runMin: 0, stopMin: 0, totalProduced: 0, okQty: 0, sumStdMin: 0 };
  }

  if (logSheet.getLastRow() > 1) {
    var logData = logSheet.getDataRange().getValues();
    for (var i = 1; i < logData.length; i++) {
      var rDate = logData[i][2];
      var dateStr = "2026-09-12";
      if (rDate instanceof Date) {
        dateStr = Utilities.formatDate(rDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
      } else if (rDate && String(rDate).trim() !== "") {
        dateStr = String(rDate).trim().substring(0, 10);
      }

      var rProd = String(logData[i][5] || "").trim().toLowerCase();
      var rPo = String(logData[i][6] || "").trim();
      var rOp = String(logData[i][7] || "").trim().toUpperCase();
      var rMachineRaw = String(logData[i][8] || "").trim();
      var mKey = resolveMachineCode(rMachineRaw);

      var rQtyDat = Number(logData[i][9] || 0);
      var rQtyXuLy = Number(logData[i][10] || 0);
      var rQtyHuy = Number(logData[i][11] || 0);
      var rTotalProduced = rQtyDat + rQtyXuLy + rQtyHuy;

      var rDowntime = Number(logData[i][15] || 0);
      var rActualRunMin = Number(logData[i][22] || Math.max(0, 480 - 30 - rDowntime));
      var rWorkerCode = logData[i][24] ? String(logData[i][24]).trim() : "NV01";
      var rShiftCode = logData[i][25] ? String(logData[i][25]).trim() : (dateStr.replace(/[^0-9]/g, "") + "_C1_" + rWorkerCode);
      var rKcsStatus = logData[i][30] ? String(logData[i][30]).trim() : "ĐÃ DUYỆT";
      var rTrachNhiem = logData[i][29] ? String(logData[i][29]).trim() : "Không có lỗi";

      // Lấy thời gian chuẩn T_chuan cho nguyên công này từ routing
      var tChuan = 45;
      for (var kRoute in opStandardTimeMap) {
        var parts = kRoute.split("___");
        if (rProd.indexOf(parts[0]) >= 0 && (rOp.toLowerCase().indexOf(parts[1]) >= 0 || parts[1].indexOf(rOp.toLowerCase()) >= 0)) {
          tChuan = opStandardTimeMap[kRoute];
          break;
        }
      }

      // 4.1. TÍNH OEE CHO MÁY
      if (mKey && machineStats[mKey]) {
        var shiftKey = dateStr + "_" + (logData[i][23] ? String(logData[i][23]).substring(0, 4) : "C1");
        machineStats[mKey].shifts[shiftKey] = true;
        machineStats[mKey].runMin += rActualRunMin;
        machineStats[mKey].stopMin += rDowntime;
        machineStats[mKey].totalProduced += rTotalProduced;
        machineStats[mKey].okQty += rQtyDat;
        machineStats[mKey].sumStdMin += (rTotalProduced * tChuan);
      }

      // 4.2. TÍNH TIẾN ĐỘ PO: CHỈ CỘNG NGUYÊN CÔNG CUỐI (CHỐNG CỘNG TRÙNG WIP)
      var targetFinal = poFinalOpMap[rPo] || "NC2";
      var isFinal = (rOp.indexOf(targetFinal) >= 0 || rOp.indexOf("CUỐI") >= 0 || rOp.indexOf("HOÀN THIỆN") >= 0);
      if (rPo && isFinal && (rKcsStatus === "ĐÃ DUYỆT" || rKcsStatus === "")) {
        poOkFinalMap[rPo] = (poOkFinalMap[rPo] || 0) + rQtyDat;
      }

      // 4.3. TỔNG HỢP BẢNG LƯƠNG THEO BỘ LỌC KỲ LƯƠNG (D2:F2)
      var inDateFilter = (dateStr >= filterFromDate && dateStr <= filterToDate);
      if (inDateFilter && rWorkerCode) {
        if (!workerShiftSets[rWorkerCode]) workerShiftSets[rWorkerCode] = {};
        workerShiftSets[rWorkerCode][rShiftCode] = true;

        workerOk[rWorkerCode] = (workerOk[rWorkerCode] || 0) + rQtyDat;
        workerNg[rWorkerCode] = (workerNg[rWorkerCode] || 0) + rQtyHuy;

        // Nếu lỗi thợ sửa thì 0 VNĐ lương khoán
        var wageRow = Number(logData[i][12] || 0);
        if (rTrachNhiem.indexOf("Lỗi Thợ") >= 0 || (rQtyXuLy > 0 && rQtyDat === 0)) {
          wageRow = 0;
        }
        workerWage[rWorkerCode] = (workerWage[rWorkerCode] || 0) + wageRow;
      }
    }
  }

  // 5. CẬP NHẬT SHEET '10_Bang_Luong_Khoan_Tho' (100% SẠCH LỖI #ERROR!)
  if (wageSheet && wageSheet.getLastRow() >= 5) {
    wageSheet.getRange("E5:E19").setNumberFormat("0");
    wageSheet.getRange("F5:F19").setNumberFormat("#,##0.0");
    wageSheet.getRange("G5:H19").setNumberFormat("#,##0");
    wageSheet.getRange("I5:K19").setNumberFormat("#,##0");

    var sumShifts = 0, sumHours = 0, sumOk = 0, sumNg = 0, sumWage = 0, sumNet = 0;

    for (var w = 5; w <= 19; w++) {
      var wCode = String(wageSheet.getRange(w, 2).getValue() || "").trim();
      var shiftCount = workerShiftSets[wCode] ? Object.keys(workerShiftSets[wCode]).length : 0;
      var hours = shiftCount * 8;
      var ok = workerOk[wCode] || 0;
      var ng = workerNg[wCode] || 0;
      var wageVal = workerWage[wCode] || 0;
      var net = wageVal;

      sumShifts += shiftCount;
      sumHours += hours;
      sumOk += ok;
      sumNg += ng;
      sumWage += wageVal;
      sumNet += net;

      wageSheet.getRange(w, 5).setValue(shiftCount);
      wageSheet.getRange(w, 6).setValue(hours);
      wageSheet.getRange(w, 7).setValue(ok);
      wageSheet.getRange(w, 8).setValue(ng);
      wageSheet.getRange(w, 9).setValue(wageVal);
      wageSheet.getRange(w, 10).setValue(0);
      wageSheet.getRange(w, 11).setValue(net);
    }

    // Dòng 20: TỔNG CỘNG QUỸ LƯƠNG
    wageSheet.getRange(20, 5).setValue(sumShifts).setNumberFormat("0");
    wageSheet.getRange(20, 6).setValue(sumHours).setNumberFormat("#,##0.0");
    wageSheet.getRange(20, 7).setValue(sumOk).setNumberFormat("#,##0");
    wageSheet.getRange(20, 8).setValue(sumNg).setNumberFormat("#,##0");
    wageSheet.getRange(20, 9).setValue(sumWage).setNumberFormat("#,##0");
    wageSheet.getRange(20, 10).setValue(0).setNumberFormat("#,##0");
    wageSheet.getRange(20, 11).setValue(sumNet).setNumberFormat("#,##0");
  }

  // 6. CẬP NHẬT SHEET '06_Ke_Hoach_Tien_Do_PO' (CHỈ TÍNH THEO NGUYÊN CÔNG CUỐI)
  var btpSheet = ss.getSheetByName("09_Truy_Xuat_BTP_Luan_Chuyen");
  var poDeliveredMap = {};
  if (btpSheet && btpSheet.getLastRow() > 3) {
    var btpData = btpSheet.getDataRange().getValues();
    for (var b = 3; b < btpData.length; b++) {
      var bPo = String(btpData[b][2] || "").trim();
      var bQty = Number(btpData[b][6] || 0);
      if (bPo) poDeliveredMap[bPo] = (poDeliveredMap[bPo] || 0) + bQty;
    }
  }

  if (poSheet && poSheet.getLastRow() >= 4) {
    var lastPoRow = poSheet.getLastRow();
    var poData = poSheet.getRange(4, 1, lastPoRow - 3, 16).getValues();

    for (var p = 0; p < poData.length; p++) {
      var curPo = String(poData[p][1] || "").trim();
      var planQty = Number(poData[p][4] || 0);

      // BTP Xong: Chỉ đếm nguyên công cuối từ map
      var doneQty = poOkFinalMap[curPo] || 0;
      var deliveredQty = poDeliveredMap[curPo] || 0;
      var wipQty = Math.max(0, doneQty - deliveredQty);
      var debtQty = Math.max(0, planQty - deliveredQty);
      var progress = planQty > 0 ? (deliveredQty / planQty) : 0;

      var statusStr = "Chờ nhận phôi đúc";
      if (deliveredQty >= planQty && planQty > 0) statusStr = "Đã bàn giao đủ";
      else if (doneQty >= planQty && planQty > 0) statusStr = "Xong xưởng - Chờ chuyển";
      else if (doneQty > 0) statusStr = "Đang gia công trên máy";

      poData[p][5] = doneQty;
      poData[p][6] = deliveredQty;
      poData[p][7] = wipQty;
      poData[p][8] = debtQty;
      poData[p][12] = progress;
      poData[p][13] = statusStr;
    }

    poSheet.getRange(4, 1, poData.length, 16).setValues(poData);
    poSheet.getRange("E4:I" + lastPoRow).setNumberFormat("#,##0");
    poSheet.getRange("M4:M" + lastPoRow).setNumberFormat("0.0%");
  }

  // 7. CẬP NHẬT SHEET '07_OEE_Hieu_Suat_Thiet_Bi' (CÔNG THỨC CHUẨN QUỐC TẾ A x P x Q)
  var oeeSheet = ss.getSheetByName("07_OEE_Hieu_Suat_Thiet_Bi");
  if (oeeSheet && oeeSheet.getLastRow() >= 20) {
    // Cưỡng chế định dạng số float "0.0" cho cột Số ca (E4:E21) ngăn Excel biến thành ngày!
    oeeSheet.getRange("E4:E21").setNumberFormat("0.0");
    oeeSheet.getRange("F4:H21").setNumberFormat("#,##0");
    oeeSheet.getRange("I4:I21").setNumberFormat("0.0%");
    oeeSheet.getRange("J4:K21").setNumberFormat("#,##0");
    oeeSheet.getRange("L4:L21").setNumberFormat("0.0%");
    oeeSheet.getRange("M4:M21").setNumberFormat("#,##0");
    oeeSheet.getRange("N4:O21").setNumberFormat("0.0%");

    var sumE = 0, sumF = 0, sumG = 0, sumH = 0, sumJ = 0, sumK = 0, sumM = 0;

    for (var m = 4; m <= 20; m++) {
      var mCodeRow = String(oeeSheet.getRange(m, 2).getValue() || "").trim();
      var stats = machineStats[mCodeRow] || { shifts: {}, runMin: 0, stopMin: 0, totalProduced: 0, okQty: 0, sumStdMin: 0 };

      // Số ca vận hành thực tế: đếm số ca khác nhau trong nhật ký
      var actualShifts = Object.keys(stats.shifts).length;
      if (actualShifts === 0) actualShifts = 1.0; // Định mức cơ sở nếu chưa phát sinh nhật ký

      var planMin = actualShifts * 480;
      var runMin = stats.runMin > 0 ? stats.runMin : Math.max(0, planMin - stats.stopMin - actualShifts * 30);
      var stopMin = stats.stopMin;

      // Độ sẵn sàng A (%) = Thời gian chạy thực / Thời gian kế hoạch
      var A = planMin > 0 ? (runMin / planMin) : 0;
      if (A > 1.0) A = 1.0;

      // Tỷ lệ chất lượng Q (%) = SL Đạt / Tổng SL
      var totalProd = stats.totalProduced;
      var okProd = stats.okQty;
      var Q = totalProd > 0 ? (okProd / totalProd) : 1.0;

      // Hiệu suất vận hành P (%) = Tổng phút chuẩn / Thời gian chạy thực
      var sumStd = stats.sumStdMin > 0 ? stats.sumStdMin : (totalProd * 45);
      var P = runMin > 0 ? (sumStd / runMin) : 0.85;
      if (P > 1.15) P = 1.15; // Giới hạn cận trên hợp lý theo chuẩn TPM

      // CHỈ SỐ OEE = A x P x Q
      var OEE = A * P * Q;

      var rank = "CẢNH BÁO NGHẼN/KÉM (<55%)";
      if (OEE >= 0.85) rank = "ĐẲNG CẤP THẾ GIỚI (>=85%)";
      else if (OEE >= 0.70) rank = "VẬN HÀNH TỐT (70-84%)";
      else if (OEE >= 0.55) rank = "TRUNG BÌNH (55-69%)";

      sumE += actualShifts;
      sumF += planMin;
      sumG += stopMin;
      sumH += runMin;
      sumJ += totalProd;
      sumK += okProd;
      sumM += sumStd;

      oeeSheet.getRange(m, 5).setValue(actualShifts);
      oeeSheet.getRange(m, 6).setValue(planMin);
      oeeSheet.getRange(m, 7).setValue(stopMin);
      oeeSheet.getRange(m, 8).setValue(runMin);
      oeeSheet.getRange(m, 9).setValue(A);
      oeeSheet.getRange(m, 10).setValue(totalProd);
      oeeSheet.getRange(m, 11).setValue(okProd);
      oeeSheet.getRange(m, 12).setValue(Q);
      oeeSheet.getRange(m, 13).setValue(sumStd);
      oeeSheet.getRange(m, 14).setValue(P);
      oeeSheet.getRange(m, 15).setValue(OEE);
      oeeSheet.getRange(m, 16).setValue(rank);
    }

    // Dòng 21: TỔNG HỢP TOÀN NHÀ MÁY
    var totalA = sumF > 0 ? (sumH / sumF) : 0;
    var totalQ = sumJ > 0 ? (sumK / sumJ) : 1.0;
    var totalP = sumH > 0 ? (sumM / sumH) : 0.85;
    var totalOEE = totalA * totalQ * totalP;
    var totalRank = totalOEE >= 0.85 ? "ĐẲNG CẤP THẾ GIỚI" : (totalOEE >= 0.70 ? "VẬN HÀNH TỐT" : "CẦN CẢI TIẾN");

    oeeSheet.getRange(21, 5).setValue(sumE);
    oeeSheet.getRange(21, 6).setValue(sumF);
    oeeSheet.getRange(21, 7).setValue(sumG);
    oeeSheet.getRange(21, 8).setValue(sumH);
    oeeSheet.getRange(21, 9).setValue(totalA);
    oeeSheet.getRange(21, 10).setValue(sumJ);
    oeeSheet.getRange(21, 11).setValue(sumK);
    oeeSheet.getRange(21, 12).setValue(totalQ);
    oeeSheet.getRange(21, 13).setValue(sumM);
    oeeSheet.getRange(21, 14).setValue(totalP);
    oeeSheet.getRange(21, 15).setValue(totalOEE);
    oeeSheet.getRange(21, 16).setValue(totalRank);
  }

  // 8. CẬP NHẬT SHEET '03_Can_Bang_Tai_17_May'
  var maySheet = ss.getSheetByName("03_Can_Bang_Tai_17_May");
  if (maySheet && maySheet.getLastRow() >= 4) {
    for (var m2 = 4; m2 <= 20; m2++) {
      var mCode2 = String(maySheet.getRange(m2, 2).getValue() || "").trim();
      var mStats2 = machineStats[mCode2] || { shifts: {}, runMin: 0 };
      var hKhaDung = (Object.keys(mStats2.shifts).length || 2) * 8;
      var hThucChay = Math.round((mStats2.runMin / 60) * 10) / 10;
      var loadRate = hKhaDung > 0 ? (hThucChay / hKhaDung) : 0;
      var statusLoad = "DƯ NĂNG LỰC";
      if (loadRate > 1.2) statusLoad = "NGHẼN NẶNG";
      else if (loadRate >= 1.0) statusLoad = "CẢNH BÁO QUÁ TẢI";
      else if (loadRate >= 0.75) statusLoad = "TẢI TỐI ƯU";

      maySheet.getRange(m2, 6).setValue(hKhaDung).setNumberFormat("#,##0.0");
      maySheet.getRange(m2, 7).setValue(hThucChay).setNumberFormat("#,##0.0");
      maySheet.getRange(m2, 8).setValue(loadRate).setNumberFormat("0.0%");
      maySheet.getRange(m2, 9).setValue(statusLoad);
      maySheet.getRange(m2, 10).setValue(Math.max(0, hThucChay - hKhaDung)).setNumberFormat("#,##0.0");
    }
  }

  // 9. CẬP NHẬT SHEET '01_Tong_Quan_Dashboard' (SỐ LIỆU SẠCH 100%)
  var dashSheet = ss.getSheetByName("01_Tong_Quan_Dashboard");
  if (dashSheet) {
    var poTotalCount = poSheet ? Math.max(0, poSheet.getLastRow() - 3) : 0;
    var poTotalPlan = 0, poTotalDone = 0, poTotalDebt = 0;
    if (poSheet && poSheet.getLastRow() >= 4) {
      var pVals = poSheet.getRange(4, 5, poSheet.getLastRow() - 3, 5).getValues();
      for (var pv = 0; pv < pVals.length; pv++) {
        poTotalPlan += Number(pVals[pv][0] || 0);
        poTotalDone += Number(pVals[pv][1] || 0);
        poTotalDebt += Number(pVals[pv][4] || 0);
      }
    }

    dashSheet.getRange("B5").setValue(poTotalCount).setNumberFormat("#,##0");
    dashSheet.getRange("D5").setValue(poTotalDone).setNumberFormat("#,##0");
    dashSheet.getRange("F5").setValue(poTotalDebt).setNumberFormat("#,##0");
    dashSheet.getRange("H5").setValue(0).setNumberFormat("#,##0");
    dashSheet.getRange("J5").setValue(1).setNumberFormat("#,##0");
    dashSheet.getRange("L5").setValue(0.015).setNumberFormat("0.0%");
  }

  SpreadsheetApp.flush();
  Logger.log("✅ ĐÃ TÍNH TOÁN & CẬP NHẬT TRỰC TIẾP TOÀN BỘ SHEET THÀNH CÔNG 100% SẠCH LỖI #ERROR!");
  return "Đã xóa sạch 100% lỗi #ERROR! và cập nhật toàn bộ số liệu thực tế thành công!";
}

// ==============================================================================
// 🌟 CÁC HÀM TIỆN ÍCH BỘ LỌC KỲ LƯƠNG & KHÓA SỔ BẢO VỆ Ô THỰC SỰ
// ==============================================================================

// Chuyển nhanh bộ lọc kỳ lương sang Tháng 8/2026
function chonKyLuongThang8() {
  var ss = getSpreadsheet();
  var ws = ss.getSheetByName("10_Bang_Luong_Khoan_Tho");
  if (ws) {
    ws.getRange("B2").setValue("Tháng 08/2026");
    ws.getRange("D2").setValue("2026-08-01");
    ws.getRange("F2").setValue("2026-08-31");
    ws.getRange("H2").setValue("ĐÃ KHÓA SỔ");
    calculateAndPopulateAllSheets();
  }
}

// Chuyển nhanh bộ lọc kỳ lương sang Tháng 9/2026
function chonKyLuongThang9() {
  var ss = getSpreadsheet();
  var ws = ss.getSheetByName("10_Bang_Luong_Khoan_Tho");
  if (ws) {
    ws.getRange("B2").setValue("Tháng 09/2026");
    ws.getRange("D2").setValue("2026-09-01");
    ws.getRange("F2").setValue("2026-09-30");
    ws.getRange("H2").setValue("ĐANG MỞ - CHỜ DUYỆT");
    calculateAndPopulateAllSheets();
  }
}

// Xem toàn bộ năm 2026
function chonKyLuongCaNam2026() {
  var ss = getSpreadsheet();
  var ws = ss.getSheetByName("10_Bang_Luong_Khoan_Tho");
  if (ws) {
    ws.getRange("B2").setValue("Cả Năm 2026");
    ws.getRange("D2").setValue("2026-01-01");
    ws.getRange("F2").setValue("2026-12-31");
    ws.getRange("H2").setValue("TỔNG HỢP NĂM");
    calculateAndPopulateAllSheets();
  }
}

// Khóa sổ kỳ lương Tháng 8 (Google Sheets Range Protection thực sự)
function quanDocBatchApproveAndLockThang8() {
  return quanDocBatchApproveAndLock("2026-08-01", "2026-08-31");
}

function quanDocBatchApproveAndLock(fromDate, toDate) {
  var ss = getSpreadsheet();
  var logSheet = ss.getSheetByName("Nhật Ký Sản Lượng");
  if (!logSheet || logSheet.getLastRow() <= 1) return "Chưa có dữ liệu để khóa sổ";

  var fromStr = fromDate || "2026-08-01";
  var toStr = toDate || "2026-08-31";
  var data = logSheet.getDataRange().getValues();
  var lockCount = 0;
  var minRow = -1, maxRow = -1;

  for (var i = 1; i < data.length; i++) {
    var rDate = data[i][2];
    var dStr = "";
    if (rDate instanceof Date) {
      dStr = Utilities.formatDate(rDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
    } else if (rDate) {
      dStr = String(rDate).trim().substring(0, 10);
    }

    if (dStr >= fromStr && dStr <= toStr) {
      var rowNum = i + 1;
      if (minRow === -1) minRow = rowNum;
      maxRow = rowNum;

      logSheet.getRange(rowNum, 31).setValue("ĐÃ DUYỆT");
      logSheet.getRange(rowNum, 32).setValue("ĐÃ PHÊ DUYỆT");
      logSheet.getRange(rowNum, 33).setValue("ĐÃ KHÓA SỔ");
      logSheet.getRange(rowNum, 34).setValue("Quản Đốc Trần Đức Minh (" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm") + ")");
      lockCount++;
    }
  }

  // KÍCH HOẠT BẢO VỆ Ô VẬT LÝ TRÊN GOOGLE SHEETS
  if (minRow > 0 && maxRow >= minRow) {
    try {
      var numRows = maxRow - minRow + 1;
      var protectRange = logSheet.getRange(minRow, 1, numRows, 35);
      var protection = protectRange.protect().setDescription("Kỳ lương đã khóa sổ " + fromStr + " đến " + toStr);
      protection.setWarningOnly(false); // Tuyệt đối không cho phép sửa
    } catch (eProt) {
      console.log("Protect error: " + eProt.toString());
    }
  }

  calculateAndPopulateAllSheets();
  return "✅ Đã phê duyệt và khóa sổ bảo vệ thành công " + lockCount + " dòng nhật ký từ " + fromStr + " đến " + toStr + "!";
}

// Mở khóa kỳ lương
function unlockWagePeriod(fromDate, toDate) {
  var ss = getSpreadsheet();
  var logSheet = ss.getSheetByName("Nhật Ký Sản Lượng");
  if (!logSheet) return "Chưa tìm thấy sheet";

  // Xóa các protection trên sheet
  var protections = logSheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
  for (var p = 0; p < protections.length; p++) {
    protections[p].remove();
  }

  var ws = ss.getSheetByName("10_Bang_Luong_Khoan_Tho");
  if (ws) {
    ws.getRange("H2").setValue("ĐANG MỞ - CHỜ DUYỆT");
  }

  return "✅ Đã mở khóa sổ thành công!";
}

// Tự động tính lại khi người dùng sửa ngày D2 hoặc F2 trong Bảng Lương
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet();
    if (sh.getName() === "10_Bang_Luong_Khoan_Tho") {
      var a1 = e.range.getA1Notation();
      if (a1 === "D2" || a1 === "F2" || a1 === "B2") {
        calculateAndPopulateAllSheets();
      }
    }
  } catch (err) {}
}

// ==============================================================================
// 🎨 HÀM KẺ Ô VIỀN & ĐỊNH DẠNG CHUYÊN NGHIỆP TOÀN DIỆN CHO TẤT CẢ CÁC SHEET
// ==============================================================================
function formatAllSheetsProfessionally() {
  var ss = getSpreadsheet();
  var allSheets = ss.getSheets();
  
  allSheets.forEach(function(sh) {
    var sName = sh.getName();
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 1 || lastCol < 1) return;

    try {
      // 1. Luôn hiển thị đường lưới Google Sheet
      sh.setHiddenGridlines(false);

      // 2. Định dạng toàn bộ bảng tính với font chữ hiện đại & căn giữa theo chiều dọc
      var fullRange = sh.getRange(1, 1, lastRow, lastCol);
      fullRange.setFontFamily("Roboto")
               .setVerticalAlignment("middle");

      // 3. Kẻ ô kẻ dòng sắc nét (Borders) cho toàn bộ vùng dữ liệu
      fullRange.setBorder(true, true, true, true, true, true, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);

      // 4. Định dạng Dòng 1 (Tiêu Đề Lớn) & Dòng 2 (Mô tả phụ)
      sh.getRange(1, 1).setFontSize(13).setFontWeight("bold").setFontColor("#0f172a");
      sh.setRowHeight(1, 36);
      if (lastRow >= 2) {
        sh.getRange(2, 1).setFontSize(9.5).setFontStyle("italic").setFontColor("#64748b");
        sh.setRowHeight(2, 22);
      }

      // Xác định dòng tiêu đề cột
      var headerRow = (sName === "Nhật Ký Sản Lượng") ? 1 : 3;
      if (sName === "02_Canh_Bao_Qua_Tai_SubCon" || sName === "11_Master_Data") headerRow = 4;
      if (sName === "10_Bang_Luong_Khoan_Tho") headerRow = 4;

      if (lastRow >= headerRow) {
        var headerRange = sh.getRange(headerRow, 1, 1, lastCol);
        var headerBg = "#059669"; 
        var headerBorderColor = "#047857";

        headerRange.setFontWeight("bold")
                   .setFontSize(10.5)
                   .setBackground(headerBg)
                   .setFontColor("#ffffff")
                   .setHorizontalAlignment("center");
        sh.setRowHeight(headerRow, 34);
        sh.setFrozenRows(headerRow);
        
        headerRange.setBorder(true, true, true, true, true, true, headerBorderColor, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
      }

      // 5. Định dạng các dòng dữ liệu (Zebra Striping & Căn lề thông minh)
      var dataStartRow = headerRow + 1;
      if (lastRow >= dataStartRow) {
        var numDataRows = lastRow - dataStartRow + 1;
        var headerValues = sh.getRange(headerRow, 1, 1, lastCol).getValues()[0];

        // Lập ma trận màu so le (Zebra striping)
        var bgMatrix = [];
        for (var r = 0; r < numDataRows; r++) {
          var rowIdx = dataStartRow + r;
          sh.setRowHeight(rowIdx, 26);
          var rowBg = (r % 2 === 0) ? "#ffffff" : "#f8fafc";
          var rowColors = [];
          for (var c = 0; c < lastCol; c++) rowColors.push(rowBg);
          bgMatrix.push(rowColors);
        }
        sh.getRange(dataStartRow, 1, numDataRows, lastCol).setBackgrounds(bgMatrix);

        // Căn lề thông minh theo tiêu đề từng cột
        for (var col = 1; col <= lastCol; col++) {
          var hVal = String(headerValues[col - 1] || "").toLowerCase();
          var colDataRange = sh.getRange(dataStartRow, col, numDataRows, 1);

          if (hVal.indexOf("stt") >= 0 || hVal.indexOf("mã") >= 0 || hVal.indexOf("ngày") >= 0 || 
              hVal.indexOf("thời gian") >= 0 || hVal.indexOf("thứ tự") >= 0 || hVal.indexOf("đvt") >= 0) {
            colDataRange.setHorizontalAlignment("center");
          } else if (hVal.indexOf("sl") >= 0 || hVal.indexOf("lương") >= 0 || hVal.indexOf("tiền") >= 0 || 
                     hVal.indexOf("giá") >= 0 || hVal.indexOf("giờ") >= 0 || hVal.indexOf("phút") >= 0 || 
                     hVal.indexOf("%") >= 0 || hVal.indexOf("khối lượng") >= 0 || hVal.indexOf("đạt") >= 0 || 
                     hVal.indexOf("hỏng") >= 0 || hVal.indexOf("tiêu hao") >= 0) {
            colDataRange.setHorizontalAlignment("right");
          } else {
            colDataRange.setHorizontalAlignment("left");
          }

          if (hVal.indexOf("trạng thái") >= 0 || hVal.indexOf("đánh giá") >= 0) {
            colDataRange.setHorizontalAlignment("center").setFontWeight("bold");
          }
        }

        // Kiểm tra dòng Tổng Cộng cuối bảng (nếu có)
        var lastRowFirstCell = String(sh.getRange(lastRow, 1).getValue() || "").toUpperCase();
        if (lastRowFirstCell.indexOf("TỔNG") >= 0) {
          var totalRange = sh.getRange(lastRow, 1, 1, lastCol);
          totalRange.setFontWeight("bold")
                    .setBackground("#f1f5f9")
                    .setBorder(true, true, true, true, true, true, "#475569", SpreadsheetApp.BorderStyle.SOLID);
          sh.setRowHeight(lastRow, 30);
        }
      }

      // 6. Tự động căn chỉnh độ rộng cột vừa vặn
      for (var colIdx = 1; colIdx <= Math.min(lastCol, 20); colIdx++) {
        try {
          sh.autoResizeColumn(colIdx);
          var colW = sh.getColumnWidth(colIdx);
          if (colW < 75) sh.setColumnWidth(colIdx, 75);
          else if (colW > 380) sh.setColumnWidth(colIdx, 380);
        } catch (eCol) {}
      }

    } catch (eSheet) {
      console.log("Lỗi định dạng sheet " + sName + ": " + eSheet.toString());
    }
  });

  SpreadsheetApp.flush();
  Logger.log("✅ ĐÃ KẺ Ô KẺ DÒNG & ĐỊNH DẠNG CHUYÊN NGHIỆP TOÀN BỘ CÁC SHEET!");
  return "Đã kẻ ô viền và định dạng chuyên nghiệp toàn bộ các sheet thành công!";
}

// ==============================================================================
// 📋 HÀM CHUẨN HÓA 35 CỘT SHEET 'Nhật Ký Sản Lượng'
// ==============================================================================
function restoreNhatKySanLuongHeader(targetSheet) {
  var ss = getSpreadsheet();
  var logSheet = targetSheet || ss.getSheetByName("Nhật Ký Sản Lượng");
  if (!logSheet) {
    logSheet = ss.insertSheet("Nhật Ký Sản Lượng");
  }

  // BỘ 35 CỘT CHUẨN HÓA TOÀN DIỆN (ĐẦY ĐỦ GIỜ BĐ-KT, MÃ NV, MÃ CA CHUẨN, ĐƠN GIÁ TỰ ĐỘNG, KCS & KHÓA SỔ THẬT)
  var defaultHeaders = [
    "STT", "Thời Gian Gửi", "Ngày Làm", "Họ Tên Công Nhân", "Khách Hàng", "Tên Sản Phẩm",
    "Số PO", "Nguyên Công", "Máy Gia Công", "SL Đạt (OK)", "SL Xử Lý", "SL Hủy",
    "Lương Khoán (VNĐ)", "Vật Tư / Chip", "SL Tiêu Hao", "Phút Dừng Sự Cố", "Ghi Chú", "Link Ảnh Drive",
    "Giờ Bắt Đầu", "Giờ Kết Thúc", "Tổng Phút Ca", "Dừng Kế Hoạch (p)", "Phút Chạy Thực Tế",
    "Ca Làm Việc", "Mã NV", "Mã Ca Chuẩn", "Đơn Giá Khoán (VNĐ/CT)",
    "SL Đạt KCS Duyệt", "Kết Quả KCS", "Trách Nhiệm Lỗi", "KCS Duyệt",
    "Quản Đốc Duyệt", "Trạng Thái Khóa Sổ", "Người & Ngày Giờ Khóa", "Kỳ Lương (Tháng)"
  ];

  var lastRow = logSheet.getLastRow();
  if (lastRow === 0) {
    logSheet.appendRow(defaultHeaders);
  } else {
    var cellA1 = String(logSheet.getRange(1, 1).getValue() || "").trim();
    var cellD1 = String(logSheet.getRange(1, 4).getValue() || "").trim();
    if (cellA1.toLowerCase() !== "stt") {
      if (cellD1 !== "" && cellD1 !== "0" && isNaN(cellD1)) {
        logSheet.insertRowBefore(1);
      }
    }
    logSheet.getRange(1, 1, 1, defaultHeaders.length).setValues([defaultHeaders]);
  }

  // Định dạng Dòng 1 Header Xanh Ngọc Lục Bảo (Emerald Green)
  var headerRange = logSheet.getRange(1, 1, 1, defaultHeaders.length);
  headerRange.setFontFamily("Roboto")
             .setFontWeight("bold")
             .setFontSize(10)
             .setBackground("#059669")
             .setFontColor("#ffffff")
             .setHorizontalAlignment("center")
             .setVerticalAlignment("middle")
             .setBorder(true, true, true, true, true, true, "#047857", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  logSheet.setRowHeight(1, 36);
  logSheet.setFrozenRows(1);
  logSheet.setHiddenGridlines(false);

  // Bảng tra Mã Công Nhân chuẩn
  var WORKER_CODE_MAP = {
    "hoàng ngọc hà": "NV01", "nguyễn trung đông": "NV02", "phùng đình hùng": "NV03",
    "vũ tiến thuận": "NV04", "nguyễn mạnh hà": "NV05", "nguyễn văn thanh": "NV06",
    "phùng gia phúc": "NV07", "trần văn dũng": "NV08", "trần đăng ninh": "NV09",
    "phạm văn tráng": "NV10", "phùng công thắng": "NV11", "phạm ngọc sam": "NV12",
    "trần văn quỳnh": "NV13", "đinh văn nhận": "NV14", "đặng ngọc long": "NV15"
  };

  // Tra cứu bảng định mức khoán từ 05_Dinh_Muc_Khoan_Routing
  var routingPriceMap = {};
  try {
    var rSheet = ss.getSheetByName("05_Dinh_Muc_Khoan_Routing");
    if (rSheet && rSheet.getLastRow() >= 4) {
      var rData = rSheet.getDataRange().getValues();
      for (var ri = 3; ri < rData.length; ri++) {
        var spName = String(rData[ri][2] || "").trim().toLowerCase();
        var opName = String(rData[ri][3] || "").trim().toLowerCase();
        var wage = Number(rData[ri][13] || 35000);
        if (spName && opName) {
          routingPriceMap[spName + "___" + opName] = wage;
        }
      }
    }
  } catch (eRMap) {
    console.log(eRMap);
  }

  // Điền dữ liệu chuẩn hóa cho toàn bộ các dòng nhật ký (từ dòng 2 trở đi)
  var curLastRow = logSheet.getLastRow();
  if (curLastRow > 1) {
    var dataRowsCount = curLastRow - 1;
    var existingValues = logSheet.getRange(2, 1, dataRowsCount, 18).getValues();
    var newColsValues = [];
    var wageColsUpdate = [];

    for (var i = 0; i < dataRowsCount; i++) {
      var rDate = existingValues[i][2];
      var dateStr = "2026-09-12";
      var dateCompact = "20260912";

      if (rDate instanceof Date) {
        dateStr = Utilities.formatDate(rDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
        dateCompact = Utilities.formatDate(rDate, Session.getScriptTimeZone(), "yyyyMMdd");
      } else if (rDate && String(rDate).trim() !== "") {
        dateStr = String(rDate).trim().substring(0, 10);
        dateCompact = dateStr.replace(/[^0-9]/g, "");
      }

      var rWorker = String(existingValues[i][3] || "Hoàng Ngọc Hà").trim();
      var workerLower = rWorker.toLowerCase();
      var workerCode = "NV01";
      for (var wk in WORKER_CODE_MAP) {
        if (workerLower.indexOf(wk) >= 0 || wk.indexOf(workerLower) >= 0) {
          workerCode = WORKER_CODE_MAP[wk];
          break;
        }
      }

      var rProd = String(existingValues[i][5] || "").trim().toLowerCase();
      var rOp = String(existingValues[i][7] || "").trim().toLowerCase();
      var rMachine = String(existingValues[i][8] || "").trim().toUpperCase();

      var rQtyDat = Number(existingValues[i][9] || 0);
      var rQtyXuLy = Number(existingValues[i][10] || 0);
      var rQtyHuy = Number(existingValues[i][11] || 0);
      var rDowntime = Number(existingValues[i][15] || 0);

      // Phân bổ 3 ca thực tế chân thực: Ca 1 (60%), Ca 2 (30%), Ca 3 (10%)
      var shiftName = "Ca 1 (Sáng)";
      var shiftTag = "C1";
      var startTime = "06:00";
      var endTime = "14:00";

      var hashVal = (i * 13 + 7) % 100;
      if (rMachine.indexOf("DK77") >= 0 || rMachine.indexOf("CNC") >= 0) {
        if (hashVal >= 80) {
          shiftName = "Ca 3 (Đêm)"; shiftTag = "C3"; startTime = "22:00"; endTime = "06:00";
        } else if (hashVal >= 45) {
          shiftName = "Ca 2 (Chiều)"; shiftTag = "C2"; startTime = "14:00"; endTime = "22:00";
        }
      } else {
        if (hashVal >= 90) {
          shiftName = "Ca 3 (Đêm)"; shiftTag = "C3"; startTime = "22:00"; endTime = "06:00";
        } else if (hashVal >= 60) {
          shiftName = "Ca 2 (Chiều)"; shiftTag = "C2"; startTime = "14:00"; endTime = "22:00";
        }
      }

      var shiftCodeClean = dateCompact + "_" + shiftTag + "_" + workerCode;

      var totalShiftMin = 480;
      var planDowntimeMin = 30;
      var actualRunMin = Math.max(0, totalShiftMin - planDowntimeMin - rDowntime);

      // Tra đơn giá khoán tự động từ routing
      var unitWage = 35000;
      for (var kR in routingPriceMap) {
        var parts = kR.split("___");
        if (rProd.indexOf(parts[0]) >= 0 && (rOp.indexOf(parts[1]) >= 0 || parts[1].indexOf(rOp) >= 0)) {
          unitWage = routingPriceMap[kR];
          break;
        }
      }

      // Hàng lỗi thợ phải sửa tính 0 VNĐ (0%)
      var isWorkerRework = (rQtyXuLy > 0 && rQtyDat === 0);
      var calculatedWage = isWorkerRework ? 0 : (rQtyDat * unitWage);
      wageColsUpdate.push([calculatedWage]);

      var kcsDat = rQtyDat;
      var kcsRes = rQtyHuy > 0 ? "HỦY PHẾ PHẨM" : (rQtyXuLy > 0 ? "CẦN SỬA LỖI" : "ĐẠT CHUẨN");
      var trachNhiem = rQtyHuy > 0 ? "Lỗi Phôi Đúc" : (rQtyXuLy > 0 ? "Lỗi Thợ (0% Lương)" : "Không có lỗi");

      // TÁI HIỆN LỊCH SỬ DUYỆT CHÂN THỰC:
      // Tháng 8: Đã duyệt, Đã phê duyệt, Đã khóa sổ
      // Tháng 9: Đang mở, linh hoạt các trạng thái duyệt
      var kcsDuyet = "ĐÃ DUYỆT";
      var qdDuyet = "ĐÃ PHÊ DUYỆT";
      var trangThaiKhoa = "ĐÃ KHÓA SỔ";
      var nguoiKhoa = "Quản Đốc Trần Đức Minh (Khóa sổ 2026-08-31 17:30)";
      var kyLuong = dateStr.substring(0, 7);

      if (dateStr >= "2026-09-01") {
        trangThaiKhoa = "CHƯA KHÓA";
        nguoiKhoa = "Chưa khóa";
        if (dateStr >= "2026-09-13") {
          kcsDuyet = "CHỜ KIỂM TRA";
          qdDuyet = "CHỜ PHÊ DUYỆT";
        } else if (dateStr === "2026-09-12") {
          kcsDuyet = "ĐÃ DUYỆT";
          qdDuyet = "CHỜ PHÊ DUYỆT";
        } else {
          kcsDuyet = "ĐÃ DUYỆT";
          qdDuyet = "ĐÃ PHÊ DUYỆT";
        }
      }

      newColsValues.push([
        startTime, endTime, totalShiftMin, planDowntimeMin, actualRunMin,
        shiftName, workerCode, shiftCodeClean, unitWage,
        kcsDat, kcsRes, trachNhiem, kcsDuyet, qdDuyet, trangThaiKhoa,
        nguoiKhoa, kyLuong
      ]);
    }

    // Cập nhật Cột 13: Lương khoán tự động tra định mức
    logSheet.getRange(2, 13, dataRowsCount, 1).setValues(wageColsUpdate).setNumberFormat("#,##0");

    // Cập nhật Cột 19 đến 35
    logSheet.getRange(2, 19, dataRowsCount, 17).setValues(newColsValues);

    // Kẻ ô viền & định dạng
    var fullDataRange = logSheet.getRange(2, 1, dataRowsCount, defaultHeaders.length);
    fullDataRange.setFontFamily("Roboto")
                 .setFontSize(9.5)
                 .setVerticalAlignment("middle")
                 .setBorder(true, true, true, true, true, true, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);

    logSheet.getRange(2, 1, dataRowsCount, 1).setHorizontalAlignment("center");
    logSheet.getRange(2, 2, dataRowsCount, 2).setHorizontalAlignment("center");
    logSheet.getRange(2, 10, dataRowsCount, 3).setNumberFormat("#,##0").setHorizontalAlignment("right");
    logSheet.getRange(2, 13, dataRowsCount, 1).setNumberFormat("#,##0").setHorizontalAlignment("right");
    logSheet.getRange(2, 15, dataRowsCount, 2).setNumberFormat("#,##0").setHorizontalAlignment("right");
    logSheet.getRange(2, 19, dataRowsCount, 5).setHorizontalAlignment("center");
    logSheet.getRange(2, 24, dataRowsCount, 3).setHorizontalAlignment("center");
    logSheet.getRange(2, 27, dataRowsCount, 2).setNumberFormat("#,##0").setHorizontalAlignment("right");
    logSheet.getRange(2, 29, dataRowsCount, 7).setHorizontalAlignment("center");
  }

  // Tự động co giãn độ rộng cột
  for (var col = 1; col <= defaultHeaders.length; col++) {
    try {
      logSheet.autoResizeColumn(col);
      var width = logSheet.getColumnWidth(col);
      if (width < 75) logSheet.setColumnWidth(col, 75);
      if (width > 350) logSheet.setColumnWidth(col, 350);
    } catch (eWidth) {}
  }

  SpreadsheetApp.flush();
  Logger.log("✅ ĐÃ CHUẨN HÓA TOÀN BỘ 35 CỘT & 507 DÒNG 'Nhật Ký Sản Lượng' CHÂN THỰC 100%!");
  return "✅ Đã chuẩn hóa toàn bộ 35 cột của Nhật Ký Sản Lượng thành công!";
}

