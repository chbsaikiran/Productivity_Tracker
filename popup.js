document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const clearBtn = document.getElementById('clearBtn');
  const totalTimeBtn = document.getElementById('totalTimeBtn');
  const totalAudioTimeBtn = document.getElementById('totalAudioTimeBtn');
  const audioTrackingBtn = document.getElementById('audioTrackingBtn');
  const exportBtn = document.getElementById('exportBtn');
  const totalTimeDiv = document.getElementById('totalTime');
  const totalAudioTimeDiv = document.getElementById('totalAudioTime');
  const recordsDiv = document.getElementById('records');
  let showTotalTime = false;
  let showTotalAudioTime = false;

  function updateUI() {
    chrome.storage.local.get(['isTracking', 'isAudioTracking', 'records'], (data) => {
      startBtn.textContent = data.isTracking ? 'Stop Tracking' : 'Start Tracking';
      audioTrackingBtn.textContent = data.isAudioTracking ? 'Stop Audio Tracking' : 'Start Audio Tracking';
      displayRecords(data.records || []);
      if (showTotalTime) {
        displayTotalTime(data.records || []);
      } else {
        totalTimeDiv.textContent = '';
      }
      if (showTotalAudioTime) {
        displayTotalAudioTime(data.records || []);
      } else {
        totalAudioTimeDiv.textContent = '';
      }
    });
  }

  function displayRecords(records) {
    const recordsList = document.getElementById('recordsList');
    if (!recordsList) {
      console.error('recordsList element not found');
      return;
    }
    recordsList.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Record</th>
            <th>Start Time</th>
            <th>Stop Time</th>
            <th>Duration</th>
            <th>Audio Active Time</th>
          </tr>
        </thead>
        <tbody>
        </tbody>
      </table>
    `;
    const tbody = recordsList.querySelector('tbody');
    
    let lastRecord = null;
    records.forEach((record, index) => {
      const startTime = new Date(record.startTime);
      const stopTime = record.stopTime ? new Date(record.stopTime) : null;
      const duration = stopTime ? (stopTime - startTime) / 1000 : 'Ongoing';
      
      // Check if this record is identical to the last one
      if (lastRecord &&
          lastRecord.stopTime === record.stopTime &&
          lastRecord.duration === duration &&
          lastRecord.audioActiveDuration === record.audioActiveDuration) {
        return; // Skip this record
      }

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${index + 1}</td>
        <td>${startTime.toLocaleString()}</td>
        <td>${stopTime ? stopTime.toLocaleString() : 'Ongoing'}</td>
        <td>${typeof duration === 'number' ? formatDuration(duration) : duration}</td>
        <td>${formatDuration(record.audioActiveDuration)}</td>
      `;
      tbody.appendChild(row);

      lastRecord = { ...record, duration }; // Update lastRecord for the next iteration
    });
  }

  function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  }

  function displayTotalTime(records) {
    const totalSeconds = records.reduce((total, record) => {
      if (record.stopTime) {
        const duration = (new Date(record.stopTime) - new Date(record.startTime)) / 1000;
        return total + duration;
      }
      return total;
    }, 0);
    totalTimeDiv.textContent = `Total Time: ${formatDuration(totalSeconds)}`;
  }

  function displayTotalAudioTime(records) {
    const totalAudioSeconds = records.reduce((total, record) => {
      return total + (record.audioActiveDuration || 0);
    }, 0);
    totalAudioTimeDiv.textContent = `Total Audio Time: ${formatDuration(totalAudioSeconds)}`;
  }

  function exportToCSV(records) {
    const csvContent = [
      ['Record', 'Start Time', 'Stop Time', 'Duration', 'Audio Active Duration'],
      ...records.map((record, index) => [
        index + 1,
        `"${new Date(record.startTime).toLocaleString()}"`,
        record.stopTime ? `"${new Date(record.stopTime).toLocaleString()}"` : 'Ongoing',
        record.stopTime ? formatDuration((new Date(record.stopTime) - new Date(record.startTime)) / 1000) : 'Ongoing',
        formatDuration(record.audioActiveDuration || 0)
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'system_usage_records.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  startBtn.addEventListener('click', () => {
    chrome.storage.local.get('isTracking', (data) => {
      const action = data.isTracking ? 'stopTracking' : 'startTracking';
      chrome.runtime.sendMessage({ action: action }, (response) => {
        if (response.success) {
          updateUI();
        }
      });
    });
  });

  clearBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'clearRecords' }, (response) => {
      if (response.success) {
        updateUI();
      }
    });
  });

  totalTimeBtn.addEventListener('click', () => {
    showTotalTime = !showTotalTime;
    updateUI();
  });

  totalAudioTimeBtn.addEventListener('click', () => {
    showTotalAudioTime = !showTotalAudioTime;
    updateUI();
  });

  audioTrackingBtn.addEventListener('click', () => {
    chrome.storage.local.get('isAudioTracking', (data) => {
      const action = data.isAudioTracking ? 'stopAudioTracking' : 'startAudioTracking';
      chrome.runtime.sendMessage({ action: action }, (response) => {
        if (response.success) {
          updateUI();
        }
      });
    });
  });

  exportBtn.addEventListener('click', () => {
    chrome.storage.local.get('records', (data) => {
      exportToCSV(data.records || []);
    });
  });

  updateUI();
  setInterval(updateUI, 1000); // Update UI every second
});
