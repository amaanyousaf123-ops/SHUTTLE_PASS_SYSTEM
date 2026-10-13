/* ============================================================
   Commander City — Shuttle Pass Google Sheets Sync Script (Ultra-Fast)
   Paste this code into Google Sheets > Extensions > Apps Script
   ============================================================ */

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "success",
    message: "Shuttle Pass Google Sheets Sync Endpoint is ACTIVE and online!"
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "No data received in request body" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Invalid JSON format: " + parseErr.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.type === "TEST_CONNECTION") {
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Google Sheets Sync Connected Successfully!" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var passes = data.passes || [];

    if (!passes || passes.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "No passes to sync", count: 0 }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var grouped = {};

    // Group passes by month and year
    passes.forEach(function(p) {
      var m = parseInt(p.month, 10);
      var y = parseInt(p.year, 10);
      
      // Fallback: parse month & year from issueDate (e.g. "01-10-2026")
      if ((isNaN(m) || !m) && p.issueDate && p.issueDate.indexOf('-') !== -1) {
        var parts = p.issueDate.split('-');
        if (parts.length === 3) {
          m = parseInt(parts[1], 10);
          y = y || parseInt(parts[2], 10);
        }
      }
      
      if (isNaN(m) || !m) m = (new Date().getMonth() + 1);
      if (isNaN(y) || !y) y = new Date().getFullYear();

      var sheetName = (monthNames[m] || ("Month_" + m)) + " " + y;
      if (!grouped[sheetName]) grouped[sheetName] = [];
      grouped[sheetName].push(p);
    });

    var headers = [
      "Serial #", "Member Code", "Member Name", "CNIC", 
      "House / Plot No", "Contact", "Pass Type", "Amount (PKR)", 
      "Payment Method", "Issue Date", "Valid Till", "Status"
    ];

    // Single batch write per monthly sheet
    for (var sheetName in grouped) {
      var sheetPasses = grouped[sheetName];
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
      } else {
        sheet.clear(); // Clear contents and formatting completely for fresh write
      }

      // Sort by serial number ascending
      sheetPasses.sort(function(a, b) {
        return (parseInt(a.serialNo) || 0) - (parseInt(b.serialNo) || 0);
      });

      var tableRows = [headers];
      var totalAmount = 0;

      sheetPasses.forEach(function(p) {
        var amt = Number(p.amount) || 0;
        totalAmount += amt;
        var memberCode = p.memberId ? ("CC-" + ("00000" + p.memberId).slice(-5)) : "CC-00000";
        var payMethod = p.paymentMethod || (p.passType === "Free" ? "Free" : "Cash");

        tableRows.push([
          "#" + (p.serialNo || ""),
          memberCode,
          p.memberName || "",
          p.cnic || "N/A",
          p.houseNo || "N/A",
          p.contact || "",
          (p.passType || "Full").toUpperCase(),
          amt,
          payMethod,
          p.issueDate || "",
          p.validTill || "",
          (p.status || "active").toUpperCase()
        ]);
      });

      // Total summary row
      tableRows.push(["TOTAL CARDS: " + sheetPasses.length, "", "", "", "", "", "TOTAL AMOUNT:", totalAmount, "", "", "", ""]);

      // WRITE ALL ROWS IN A SINGLE BATCH CALL
      var range = sheet.getRange(1, 1, tableRows.length, headers.length);
      range.setValues(tableRows);

      // Make grid lines visible & freeze header
      sheet.setHiddenGridlines(false);
      sheet.setFrozenRows(1);

      // Fast Batch Styling - Header Row
      sheet.getRange(1, 1, 1, headers.length)
        .setFontWeight("bold")
        .setBackground("#1e293b")
        .setFontColor("#ffffff")
        .setHorizontalAlignment("center");

      // Total Summary Row Styling
      sheet.getRange(tableRows.length, 1, 1, headers.length)
        .setFontWeight("bold")
        .setBackground("#f1f5f9")
        .setFontColor("#0f172a");

      // Align Amount column to right
      sheet.getRange(2, 8, tableRows.length - 1, 1).setHorizontalAlignment("right");
    }

    // Also populate dedicated 'Online OCR Transactions' sheet if any online passes exist
    var onlinePasses = passes.filter(function(p) { return p.transactionId || (p.paymentMethod && p.paymentMethod.indexOf('Online') !== -1); });
    if (onlinePasses.length > 0) {
      var onlineSheet = ss.getSheetByName("Online OCR Transactions");
      if (!onlineSheet) {
        onlineSheet = ss.insertSheet("Online OCR Transactions");
      }
      var onlineHeaders = ["Timestamp", "Transaction ID (TID)", "Serial #", "Member Name", "CNIC", "Pass Month", "Amount (PKR)", "Provider", "Status", "Verified By"];
      var onlineRows = [onlineHeaders];
      onlinePasses.forEach(function(op) {
        onlineRows.push([
          op.verifiedAt || op.createdAt || new Date().toISOString(),
          op.transactionId || "N/A",
          "#" + (op.serialNo || ""),
          op.memberName || "",
          op.cnic || "N/A",
          (op.month || "") + "/" + (op.year || ""),
          Number(op.amount) || 0,
          op.paymentMethod || "Online",
          "ACCEPTED",
          op.verifiedBy || "AI OCR"
        ]);
      });
      onlineSheet.clear();
      var oRange = onlineSheet.getRange(1, 1, onlineRows.length, onlineHeaders.length);
      oRange.setValues(onlineRows);
      onlineSheet.getRange(1, 1, 1, onlineHeaders.length).setFontWeight("bold").setBackground("#0f766e").setFontColor("#ffffff");
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      count: passes.length,
      sheetsUpdated: Object.keys(grouped),
      onlineLogged: onlinePasses.length,
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
