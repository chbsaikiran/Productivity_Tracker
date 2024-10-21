let isTracking = false;
let isAudioTracking = false;
let currentRecord = null;
let lastActiveTime = Date.now();
let audioActiveStartTime = null;
let totalAudioDuration = 0;
let lastAudioDuration = 0;
let isFirstRecordAfterWake = true;
let isHandlingLock = false;

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
  resumeAudioTracking();
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
  //currentRecord = null;
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
  // Calculate duration
  const startTime = new Date(record.startTime);
  const stopTime = new Date(record.stopTime);
  const duration = (stopTime - startTime) / 1000; // duration in seconds

  // Only display and save the record if it has a non-zero duration
  if (duration > 0) {
    chrome.runtime.sendMessage({ 
      action: 'displayRecord', 
      record: {
        ...record,
        duration: formatDuration(duration)
      }
    });
    saveRecord(record);
  }
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${hours}h ${minutes}m ${remainingSeconds}s`;
}

chrome.idle.onStateChanged.addListener((state) => {
  console.log('State changed to:', state); // Debug log

  if (state === 'active') {
    isHandlingLock = false; // Reset the lock handling flag
    chrome.storage.local.get(['trackingFlag', 'isAudioTracking'], (data) => {
      if (data.trackingFlag) {
        const now = Date.now();
        if (isFirstRecordAfterWake) {
          // This is the first activation after sleep/lock
          if (!currentRecord) {
            startNewRecord();
          }
          
          isFirstRecordAfterWake = false;
          lastActiveTime = now;

          // Restart audio tracking if it was active before
          if (data.isAudioTracking) {
            startAudioTracking();
          }
        }
        lastActiveTime = now;
      }
    });
  } else if (state === 'locked' && !isHandlingLock) {
    isHandlingLock = true; // Set the flag to indicate we're handling a lock event
    console.log('System locked. Current record:', currentRecord); // Debug log

    // System is locked
    if (currentRecord) {
      const now = new Date();
      currentRecord.stopTime = now.toISOString();
      console.log('Setting stop time:', currentRecord.stopTime); // Debug log
      updateAudioDuration();
      currentRecord.audioActiveDuration = totalAudioDuration;
      saveRecord(currentRecord);
      displayRecord(currentRecord);
      console.log('Record saved and displayed:', currentRecord); // Debug log
      
      // Reset the current record after handling the lock event
      currentRecord = null;
    } else {
      console.log('No current record to finish'); // Debug log
    }
    
    isFirstRecordAfterWake = true;
    
    // Pause audio tracking when locked, but don't stop it
    if (isAudioTracking) {
      pauseAudioTracking();
      console.log('Audio tracking paused due to lock'); // Debug log
    }
    
    // Reset audio duration values for the new session
    totalAudioDuration = 0;
    lastAudioDuration = 0;
    audioActiveStartTime = null;
    chrome.storage.local.set({ totalAudioDuration: 0 });
  }
});

function pauseAudioTracking() {
  if (audioActiveStartTime) {
    totalAudioDuration += (Date.now() - audioActiveStartTime) / 1000;
    audioActiveStartTime = null;
  }
  chrome.storage.local.set({ totalAudioDuration: totalAudioDuration });
  // Don't change isAudioTracking here
}

function resumeAudioTracking() {
  if (isAudioTracking) {
    audioActiveStartTime = Date.now();
  }
}

chrome.system.display.onDisplayChanged.addListener(() => {
  chrome.system.display.getInfo((displays) => {
    const allDisplaysOff = displays.every(display => !display.isEnabled);
    if (allDisplaysOff) {
      console.log('All displays turned off, likely locked');
      // Handle this as if the system was locked
      if (currentRecord) {
        const now = new Date();
        currentRecord.stopTime = now.toISOString();
        updateAudioDuration();
        currentRecord.audioActiveDuration = totalAudioDuration;
        saveRecord(currentRecord);
        displayRecord(currentRecord);
      }
      isFirstRecordAfterWake = true;
      if (isAudioTracking) {
        stopAudioTracking();
      }
    }
  });
});
