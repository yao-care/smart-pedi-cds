<script lang="ts">
  import { assessmentStore } from '../../lib/stores/assessment.svelte';
  import { recordEvent, saveMedia } from '../../lib/db/assessment-events';

  let videoElement = $state<HTMLVideoElement | null>(null);
  let stream: MediaStream | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let videoChunks: Blob[] = [];
  let isRecording = $state(false);
  let hasRecorded = $state(false);
  let permissionGranted = $state(false);
  let permissionError = $state<string | null>(null);
  let recordingSeconds = $state(0);
  let recordingTimer: ReturnType<typeof setInterval> | null = null;
  let useFileImport = $state(false);

  const MAX_DURATION = 15; // seconds

  // Connect stream to video element when both are available
  $effect(() => {
    if (videoElement && stream && permissionGranted) {
      videoElement.srcObject = stream;
      videoElement.play().catch(() => {});
    }
  });

  async function requestCameraPermission() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      permissionGranted = true;
    } catch {
      permissionError = '無法存取攝影機。您可以改用匯入影片。';
    }
  }

  async function startRecording() {
    if (!stream) return;
    videoChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) videoChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(videoChunks, { type: 'video/webm' });
      await saveVideoBlob(blob, recordingSeconds);
      hasRecorded = true;
    };

    mediaRecorder.start();
    isRecording = true;
    recordingSeconds = 0;
    hasRecorded = false;

    recordingTimer = setInterval(() => {
      recordingSeconds++;
      if (recordingSeconds >= MAX_DURATION) {
        stopRecording();
      }
    }, 1000);

    if (assessmentStore.assessment && assessmentStore.child) {
      await recordEvent({
        assessmentId: assessmentStore.assessment.id,
        childId: assessmentStore.child.id,
        moduleType: 'video',
        eventType: 'video_start',
        timestamp: new Date(),
        data: { source: 'camera' },
      });
    }
  }

  function stopRecording() {
    if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
    isRecording = false;
  }

  async function saveVideoBlob(blob: Blob, duration: number) {
    if (assessmentStore.assessment && assessmentStore.child) {
      await saveMedia({
        assessmentId: assessmentStore.assessment.id,
        childId: assessmentStore.child.id,
        fileType: 'video',
        blob,
        mimeType: blob.type,
        fileSize: blob.size,
        duration,
      });

      await recordEvent({
        assessmentId: assessmentStore.assessment.id,
        childId: assessmentStore.child.id,
        moduleType: 'video',
        eventType: 'video_end',
        timestamp: new Date(),
        data: { duration, fileSize: blob.size, source: useFileImport ? 'imported' : 'camera' },
      });
    }
  }

  async function handleFileImport(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const duration = 0; // Duration unknown from file metadata without loading
    await saveVideoBlob(file, duration);
    hasRecorded = true;
  }

  function cleanup() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    if (recordingTimer) clearInterval(recordingTimer);
  }
</script>

<div class="video-module">
  {#if hasRecorded}
    <div class="video-complete">
      <div class="complete-icon">&#x1F4F9;</div>
      <h2>影片錄製完成！</h2>
      <p>影片已儲存。</p>
      <div class="complete-actions">
        <button class="btn-retry" onclick={() => { hasRecorded = false; }}>重新錄製</button>
        <button class="btn-next" onclick={() => { cleanup(); assessmentStore.nextStep(); }}>繼續下一步 →</button>
      </div>
    </div>
  {:else if useFileImport}
    <div class="file-import">
      <h2>匯入影片</h2>
      <p>請選擇一段兒童活動的影片（建議 15 秒內）。</p>
      <label class="file-input-label">
        選擇檔案
        <input type="file" accept="video/*" onchange={handleFileImport} />
      </label>
      <button class="btn-back" onclick={() => useFileImport = false}>改用攝影機</button>
    </div>
  {:else if !permissionGranted}
    <div class="permission-prompt">
      <div class="module-icon" aria-hidden="true">📹</div>
      <h2>影片錄製</h2>
      <p>請錄製一段孩子自由活動的影片，系統將分析動作發展狀況。</p>
      <p>建議讓孩子在鏡頭前走動、伸手、蹲下等自然動作（約 15 秒）。</p>
      <p class="hint">請讓孩子在鏡頭前自由活動。</p>
      {#if permissionError}
        <p class="error">{permissionError}</p>
      {/if}
      <button class="btn-primary" onclick={requestCameraPermission}>開啟攝影機</button>
      <button class="btn-alt" onclick={() => useFileImport = true}>改用匯入影片</button>
      <button class="btn-skip" onclick={() => assessmentStore.nextStep()}>跳過影片錄製</button>
    </div>
  {:else}
    <div class="recording-area">
      <div class="video-preview">
        <!-- svelte-ignore a11y_media_has_caption -->
        <video bind:this={videoElement} muted playsinline></video>
        {#if isRecording}
          <div class="rec-badge">
            <span class="rec-dot"></span>
            REC {recordingSeconds}s / {MAX_DURATION}s
          </div>
        {/if}
      </div>

      <div class="recording-controls">
        {#if isRecording}
          <button
            class="btn-stop-circle"
            onclick={stopRecording}
            aria-label="停止錄製"
          >
            <span class="stop-icon"></span>
          </button>
          <p class="control-label" aria-hidden="true">停止錄製</p>
        {:else}
          <button
            class="btn-record-circle"
            onclick={startRecording}
            aria-label="開始錄製"
          >
            <span class="record-icon"></span>
          </button>
          <p class="control-label" aria-hidden="true">開始錄製</p>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .video-module {
    max-width: 480px;
    margin: 0 auto;
    padding: var(--space-6);
  }

  /* Complete & permission screens */
  .video-complete,
  .permission-prompt,
  .file-import {
    text-align: center;
    padding: var(--space-8) 0;
  }

  .video-complete h2,
  .permission-prompt h2,
  .file-import h2 {
    font-size: var(--text-2xl);
    margin-bottom: var(--space-3);
  }

  .video-complete p,
  .permission-prompt p,
  .file-import p {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    margin-bottom: var(--space-4);
  }

  .complete-icon {
    font-size: 56px;
    margin-bottom: var(--space-4);
  }

  .hint {
    font-size: var(--text-xs);
    color: var(--color-text-subtle);
    font-style: italic;
    margin-bottom: var(--space-6);
  }

  /* Complete actions */
  .complete-actions {
    display: flex;
    gap: var(--space-3);
    margin-top: var(--space-4);
  }

  /* Video preview */
  .video-preview {
    position: relative;
    width: 100%;
    max-height: 400px;
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: #000;
    margin-bottom: var(--space-6);
  }

  .video-preview video {
    width: 100%;
    max-height: 400px;
    display: block;
    object-fit: cover;
  }

  /* Recording badge */
  .rec-badge {
    position: absolute;
    top: var(--space-3);
    left: var(--space-3);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    background: rgba(0, 0, 0, 0.6);
    color: white;
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
  }

  .rec-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    background: #ef4444;
    border-radius: var(--radius-full);
    animation: pulse-rec 1s ease-in-out infinite;
  }

  @keyframes pulse-rec {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(1.3); }
  }

  /* Recording controls */
  .recording-controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
  }

  .btn-record-circle,
  .btn-stop-circle {
    width: 64px;
    height: 64px;
    border-radius: var(--radius-full);
    border: 4px solid var(--border-strong);
    background: var(--bg);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }

  .btn-record-circle:hover {
    border-color: #ef4444;
  }

  .btn-stop-circle {
    border-color: #ef4444;
  }

  .btn-stop-circle:hover {
    background: var(--bg-muted);
  }

  .record-icon {
    display: block;
    width: 28px;
    height: 28px;
    background: #ef4444;
    border-radius: var(--radius-full);
  }

  .stop-icon {
    display: block;
    width: 22px;
    height: 22px;
    background: #ef4444;
    border-radius: var(--radius-sm);
  }

  .control-label {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  /* File import */
  .file-input-label {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4) var(--space-7);
    background: var(--accent);
    color: white;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-bold);
    cursor: pointer;
    min-height: 56px;
    margin-bottom: var(--space-3);
  }

  .file-input-label:hover {
    background: color-mix(in srgb, var(--accent) 85%, black);
  }

  .file-input-label input[type="file"] {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
    pointer-events: none;
  }

  /* Buttons */
  .btn-primary {
    width: 100%;
    padding: var(--space-4);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-bold);
    cursor: pointer;
    min-height: 56px;
    margin-bottom: var(--space-3);
  }

  .btn-primary:hover {
    background: color-mix(in srgb, var(--accent) 85%, black);
  }

  .btn-next {
    flex: 1;
    padding: var(--space-4);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-bold);
    cursor: pointer;
    min-height: 56px;
  }

  .btn-next:hover {
    background: color-mix(in srgb, var(--accent) 85%, black);
  }

  .btn-retry {
    flex: 1;
    padding: var(--space-3);
    background: none;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    cursor: pointer;
    min-height: 56px;
  }

  .btn-retry:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .btn-alt {
    width: 100%;
    padding: var(--space-3);
    background: none;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    cursor: pointer;
    min-height: 48px;
    margin-bottom: var(--space-2);
  }

  .btn-alt:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .btn-back {
    display: inline-block;
    padding: var(--space-2) var(--space-5);
    background: none;
    border: none;
    color: var(--color-text-subtle);
    font-size: var(--text-xs);
    cursor: pointer;
    min-height: 44px;
  }

  .btn-back:hover {
    color: var(--color-text-muted);
  }

  .btn-skip {
    width: 100%;
    padding: var(--space-3);
    background: none;
    border: none;
    color: var(--color-text-subtle);
    font-size: var(--text-xs);
    cursor: pointer;
    min-height: 44px;
  }

  .btn-skip:hover {
    color: var(--color-text-muted);
  }

  .error {
    color: var(--danger);
    font-size: var(--text-sm);
    margin-bottom: var(--space-4);
  }
</style>
