
// Gets permanent oAuth2 token from Slack and stores in Project properties
function getSlackToken() {
  var scope = 'users:read';
  var clientId = PropertiesService.getScriptProperties().getProperty(key);
  var respJson = JSON.parse(UrlFetchApp.fetch('https://slack.com/oauth/authorize'));
};

// Injects any external CSS or JS pages on the client side (pages must me .html snippets with style/script tags)
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename)
      .getContent();
}

// Aggregates a record in a dict { STR monthYearKey: INT recordCount } (called within a loop through all records)
function aggregateDates(aTimestamp, monthDict) {
  var MONTHLIST = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  if(!(monthDict[MONTHLIST[new Date(aTimestamp).getMonth()] + ' ' + new Date(aTimestamp).getYear()])) {
    monthDict[MONTHLIST[new Date(aTimestamp).getMonth()] + ' ' + new Date(aTimestamp).getYear()] = 1;
  }
  else {
    monthDict[MONTHLIST[new Date(aTimestamp).getMonth()] + ' ' + new Date(aTimestamp).getYear()] += 1;
  };
  return monthDict;
};

// Generates a (pseudo)random string for each record (called from within doPost)
function getRandomString() {
  var charList = ['a','b','c','d','e','f','g','h','i','j'];
  var randStr = '';
  for(i=0;i<16;i++) {
    randStr += charList[Math.floor(Math.random() * 10)];
    randStr += Math.floor(Math.random() * 10).toString();
  };
  return randStr;
};

function mergeSort() {
    // may implement merge sort (or other sort) here if input/dataset gets too large
};
  
//*** POST Handler ***

function doPost(e) {
  
  // Get database spreadsheet ID string from Properties
  var scriptProperties = PropertiesService.getScriptProperties();
  var sheetID = scriptProperties.getProperty('googleSheetID');
  
  // Open and set spreadsheet object, then get row number of last record
  var ss = SpreadsheetApp.openById(sheetID);
  var sheet = ss.getSheetByName('msgLog');
  var lastRow = sheet.getLastRow();
  var timeStamp = Date.now();
  var randomKeyString = getRandomString();
  var regExp;
  var regExpGrp;
  var receiverHandle;
  
  // Get unique Slack token from Properties
  var slackToken = scriptProperties.getProperty('slackPostToken');
  
  // Get this script's public URL from Properties
  var scriptUrl = scriptProperties.getProperty('scriptUrl');
  
  // Get text parameter from record
  var regExpText = e.parameter['text']
  
  // Initialize bool for #secret flag in Slack record to false (public)
  var secretBool = false;
  
  // Check unique token in Slack POST to verify request came from Slack integration, return 401 if not
  if(slackToken !== e.parameter.token) {
    return ContentService.createTextOutput('{"error": {"code": 401,"message": "Not Authorized"}}').setMimeType(ContentService.MimeType.JSON);
  };
  
  // Check for a receiver of the Kudos, return error message to Slack if no user specified
  regExp = /@(\w+)/i;
  
  regExpGrp = regExp.exec(regExpText);
  if(!(regExpGrp)) {
    return ContentService.createTextOutput("You didn't give me an @user").setMimeType(ContentService.MimeType.XML);
  }
  else {
    receiverHandle = regExpGrp[1];
  };
  
  // Set secretBool based on presence/absence of #secret flag in text
  regExp = /#secret/i;
  
  regExpGrp = regExp.exec(regExpText);
  if(regExpGrp) {
    secretBool = true;
  };
  e.parameter['secret'] = secretBool;
  
  e.parameter['timestamp'] = Date.now();

  // Set modified POST as a new record in dataset spreadsheet with unique key in column 1 and POST in column 2
  sheet.getRange(lastRow + 1, 1, 1, 2).setValues(
    [[
      randomKeyString, JSON.stringify(e.parameter)
    ]]
  );
  
  // Respond to Slack with a formatted message
  var respString = e.parameter['user_name'] + " sent " + receiverHandle + 
   " some <" + scriptUrl + "?q=" + 
     randomKeyString + "|sweet Kudos!";
  return ContentService.createTextOutput(respString).setMimeType(ContentService.MimeType.XML);
};


//*** GET Handler

function doGet(e) {
  
  // Grab the Script properties in an object
  var scriptProperties = PropertiesService.getScriptProperties();
  
  // Initialize var with unique Slack token for request verification
  var slackApiToken = scriptProperties.getProperty('slackApiToken');
  
  // Initialize HTML object to serve
  var theHtml = HtmlService.createTemplateFromFile('kudos');
  
  // Get key to ID record in dataset
  var theKey = e.parameter.q;
  
  // Get Google Sheet ID from Script Properties
  var sheetID = scriptProperties.getProperty('googleSheetID');

  // Open and set Google Sheet object
  var ss = SpreadsheetApp.openById(sheetID);
  var theSheet = ss.getSheetByName('msgLog');
  
  // Read all data from Google sheet
  var theData = theSheet.getRange(1, 1, theSheet.getLastRow(), theSheet.getLastColumn()).getValues();
  
  // Objects for initialization later
  var theDict;
  var tempDateDict = {};
  var chartData = {};
  
  // Match ID by looping through all records
  for(i=0;i<theData.length;i++) {
    if(theData[i][0] === theKey) {
      
      // Read data from matching record
      theDict = JSON.parse(theData[i][1]);
    };
    
    // Add up all records for each month - could probabaly do this offline in a cron job if too expensive here
    tempDateDict = aggregateDates(JSON.parse(theData[i][1]).timestamp, tempDateDict);
  };
  
  
  var regExp;
  var regExpGrp;
  var theSenderName, theReceiverName, theGifText, theKudos, timeSent, timeString;
  var stickerList = [];
  var secretBool = false;
  
  // Set parameters to query Slack's API for full user/team info (https://api.slack.com/methods)
  var params = {
    "method": "post",
    "payload": {"token": slackApiToken}
  };

  var theUsers = JSON.parse(UrlFetchApp.fetch("https://slack.com/api/users.list", params));
  
  // Parse for @user in text string
  regExp = /@(\w+)/i;
  regExpGrp = regExp.exec(theDict['text']);
  for(i=0;i<theUsers.members.length;i++) {
    // Get the full name of the receiver
    if(theUsers.members[i].name === regExpGrp[1]) {
      theReceiverName = theUsers.members[i].real_name;
    };
    // Get the full name of the sender
    if(theUsers.members[i].name === theDict.user_name) {
      theSenderName = theUsers.members[i].real_name;
    };
  };
  
  // Get any GIF search words
  regExp = /#giphy\s(.+?)#/i;
  regExpGrp = regExp.exec(theDict['text']);
  if(regExpGrp) {
    // Hit Giphy API for top search result
    theGifText = getGiphy(regExpGrp[1], 'gif');
  }
  else {
    // If no search match
    theGifText = '';
  };
  
  // Set stickerBool if user added #stickers
  regExp = /#sticker/i;
  regExpGrp = regExp.exec(theDict['text']);
  if(regExpGrp) {
    stickerList = getGiphy(null, 'stickers');
  };
  
  // Get the text of the Kudos msg
  regExp = /#msg(.+)/i;
  regExpGrp = regExp.exec(theDict['text']);
  if(regExpGrp) {
    theKudos = regExpGrp[1];
  }
  else {
    theKudos = "No message"
  };

  //Get original timestamp and build a string for display
  timeSent = new Date(theDict['timestamp']);
  timeString = (timeSent.getMonth() + 1).toString() + '/' + timeSent.getDate() + '/' + timeSent.getYear()
  
  //build ZingChart
  var chartData = {
    "type":"line",
    "title": {
      "text": "Kudos Sent",
      "width":150,
      "height":30,
      "offset-x":100,
      "offset-y":10,
      "background-color":"#4885a2",
      "color":"#ccc",
      "border-radius":"4px"
    },
    "scale-x":{
      "labels": []
    },
    "series":[
        { "values": []}
    ]
  };
  
  // loop and push data for chart from the date aggregator
  for(key in tempDateDict) {
    chartData['scale-x'].labels.push(key);
    chartData.series[0].values.push(tempDateDict[key]);
  };
  
  // Set parameters object to pass to HTML page for client-side scripting
  var theParams = {
    'to': theReceiverName,
    'from': theSenderName,
    'date': timeString,
    'comment': theKudos,
    'gif': theGifText,
    'stickers': stickerList,
    'chart': chartData
  }
  theHtml.data = theParams;
  
  return theHtml.evaluate().setSandboxMode(HtmlService.SandboxMode.IFRAME);
};


// Gets GIFs and Sticker GIFs from Giphy API (https://github.com/Giphy/GiphyAPI)
function getGiphy(string, gifType) {
  var giphyApiToken = PropertiesService.getScriptProperties().getProperty('giphyApiToken');
  if(gifType === 'gif') {
    var theJson = JSON.parse(UrlFetchApp.fetch('https://api.giphy.com/v1/gifs/translate?s=' + string + '&rating=pg-13&api_key=' + giphyApiToken));
    if(theJson.data.length === 0) {
      return '';
    }
    else {
      var theGif = theJson['data']['images']['fixed_height']['url'];
      return theGif;
    };
  };
  if(gifType === 'stickers') {
    var theGifList = [];
    for(i=0;i<3;i++) {
      var theJson = JSON.parse(UrlFetchApp.fetch('https://api.giphy.com/v1/stickers/random?rating=g&tag=thank+you&api_key=' + giphyApiToken));
      theGifList.push(theJson['data']['fixed_width_downsampled_url']);
    };
    return theGifList;
  };
};
  

