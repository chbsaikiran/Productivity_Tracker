let isTracking = false;
let isAudioTracking = false;
let currentRecord = null;
let lastActiveTime = Date.now();
let audioActiveStartTime = null;
let totalAudioDuration = 0;
let lastAudioDuration = 0;
let isFirstRecordAfterWake = true;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ records: [], isTracking: false, isAudioTracking: false, trackingFlag: false, totalAudioDuration: 0 });
  chrome.alarms.create('checkSystemState', { periodInMinutes: 1 });
});

function startTracking() {
  isTracking = true;
  chrome.storage.local.set({ isTracking: true, trackingFlag: true });
  checkSystemState();
}

function stopTracking() {
  isTracking = false;
  chrome.storage.local.set({ isTracking: false, trackingFlag: false });
  if (currentRecord) {
    finishCurrentRecord();
  }
}

function startAudioTracking() {
  isAudioTracking = true;
  chrome.storage.local.set({ isAudioTracking: true });
  audioActiveStartTime = Date.now();
  totalAudioDuration = lastAudioDuration;
}

function stopAudioTracking() {
  isAudioTracking = false;
  chrome.storage.local.set({ isAudioTracking: false });
  
  // Immediately update the audio duration if audio is currently active
  if (audioActiveStartTime) {
    totalAudioDuration += (Date.now() - audioActiveStartTime) / 1000;
    audioActiveStartTime = null;
  }
  
  lastAudioDuration = totalAudioDuration;
  if (currentRecord) {
    currentRecord.audioActiveDuration = totalAudioDuration;
    saveRecord(currentRecord);
  }
  chrome.storage.local.set({ totalAudioDuration: totalAudioDuration });
}

function checkSystemState() {
  chrome.storage.local.get(['trackingFlag', 'totalAudioDuration'], (data) => {
    if (data.trackingFlag) {
      isTracking = true;
      totalAudioDuration = data.totalAudioDuration || 0;
      chrome.idle.queryState(60, (state) => {
        const now = Date.now();

        if (state === 'locked' && currentRecord) {
          finishCurrentRecord();
          displayRecord(currentRecord); // Add this line to display the record immediately
        } else if (state === 'active') {
          if (!currentRecord) {
            startNewRecord();
          }
          lastActiveTime = now;
        }
      });

      // Check audio activity
      if (isAudioTracking) {
        chrome.tabs.query({audible: true}, (tabs) => {
          if (tabs.length > 0 && !audioActiveStartTime) {
            audioActiveStartTime = Date.now();
          } else if (tabs.length === 0 && audioActiveStartTime) {
            updateAudioDuration();
            audioActiveStartTime = null;
          }
        });
      }
    } else {
      isTracking = false;
    }
  });

  if (isTracking) {
    setTimeout(checkSystemState, 1000); // Check every second while tracking
  }
}

function startNewRecord() {
  currentRecord = { 
    startTime: new Date().toISOString(), 
    stopTime: null, 
    audioActiveDuration: 0
  };
  totalAudioDuration = 0;
  lastAudioDuration = 0;
  chrome.storage.local.set({ totalAudioDuration: 0 });
  saveRecord(currentRecord);
}

function finishCurrentRecord() {
  currentRecord.stopTime = new Date().toISOString();
  updateAudioDuration();
  currentRecord.audioActiveDuration = totalAudioDuration;
  saveRecord(currentRecord);
  currentRecord = null;
  audioActiveStartTime = null;
}

function updateAudioDuration() {
  if (audioActiveStartTime && currentRecord && isAudioTracking) {
    totalAudioDuration += (Date.now() - audioActiveStartTime) / 1000;
    currentRecord.audioActiveDuration = totalAudioDuration;
    saveRecord(currentRecord);
    chrome.storage.local.set({ totalAudioDuration: totalAudioDuration });
  }
}

function saveRecord(record) {
  chrome.storage.local.get('records', (data) => {
    const records = data.records || [];
    const existingIndex = records.findIndex(r => r.startTime === record.startTime);
    if (existingIndex !== -1) {
      records[existingIndex] = record;
    } else {
      records.push(record);
    }
    chrome.storage.local.set({ records: records });
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startTracking') {
    startTracking();
    sendResponse({ success: true });
  } else if (request.action === 'stopTracking') {
    stopTracking();
    sendResponse({ success: true });
  } else if (request.action === 'startAudioTracking') {
    startAudioTracking();
    sendResponse({ success: true });
  } else if (request.action === 'stopAudioTracking') {
    stopAudioTracking();
    sendResponse({ success: true });
  } else if (request.action === 'clearRecords') {
    chrome.storage.local.set({ records: [], totalAudioDuration: 0 });
    currentRecord = null;
    audioActiveStartTime = null;
    totalAudioDuration = 0;
    lastAudioDuration = 0;
    sendResponse({ success: true });
  } else if (request.action === 'getRecords') {
    chrome.storage.local.get('records', (data) => {
      sendResponse({ records: data.records || [] });
    });
    return true; // Indicates that the response is asynchronous
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkSystemState') {
    checkSystemState();
  }
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(['trackingFlag', 'isAudioTracking', 'totalAudioDuration'], (data) => {
    if (data.trackingFlag) {
      startTracking();
    }
    if (data.isAudioTracking) {
      startAudioTracking();
    }
    totalAudioDuration = data.totalAudioDuration || 0;
    lastAudioDuration = totalAudioDuration;
  });
});

checkSystemState();

// Add this new function to display the record
function displayRecord(record) {
  chrome.runtime.sendMessage({ action: 'displayRecord', record: record });
}

chrome.idle.onStateChanged.addListener((state) => {
  if (state === 'active') {
    chrome.storage.local.get(['trackingFlag', 'isAudioTracking'], (data) => {
      if (data.trackingFlag) {
        const now = Date.now();
        if (isFirstRecordAfterWake) {
          // This is the first activation after sleep/lock
          stopTracking();
          startTracking();
          startNewRecord();
          isFirstRecordAfterWake = false;
          
          // Reset audio duration values
          totalAudioDuration = 0;
          lastAudioDuration = 0;
          chrome.storage.local.set({ totalAudioDuration: 0 });
        } else if (!currentRecord) {
          // If there's no current record, start a new one
          //startNewRecord();
        }
        lastActiveTime = now;

        // Check if audio tracking should be active and restart it if necessary
        if (data.isAudioTracking) {
          if (!isAudioTracking) {
            startAudioTracking();
          }
        }
      }
    });
  } else if (state === 'locked' && currentRecord) {
    // System is locked
    finishCurrentRecord();
    displayRecord(currentRecord);
    isFirstRecordAfterWake = true;
  }
});
