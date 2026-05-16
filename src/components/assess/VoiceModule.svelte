<script lang="ts">
  import { assessmentStore } from '../../lib/stores/assessment.svelte';
  import { recordEvent, saveMedia } from '../../lib/db/assessment-events';
  import { instructionLevel } from '../../lib/utils/age-groups';

  // Voice prompts per age group
  // image: large emoji shown to child; ttsText: what TTS says (may differ from display)
  interface VoicePrompt {
    id: string;
    ttsText: string;      // TTS 播放的文字
    displayText: string;   // 畫面上顯示的指令文字
    image?: string;        // 大圖 emoji（給孩子看）
    imageLabel?: string;   // 圖片的正確答案（用於紀錄）
    minAge: string;
  }

  const PROMPTS: VoicePrompt[] = [
    { id: 'v-01', ttsText: '你叫什麼名字？', displayText: '你叫什麼名字？', minAge: '13-24m' },
    { id: 'v-02', ttsText: '這是什麼？', displayText: '這是什麼？', image: '🍎', imageLabel: '蘋果', minAge: '13-24m' },
    { id: 'v-03', ttsText: '這是什麼？', displayText: '這是什麼？', image: '🐶', imageLabel: '狗', minAge: '13-24m' },
    { id: 'v-04', ttsText: '這是什麼？', displayText: '這是什麼？', image: '🚗', imageLabel: '車子', minAge: '13-24m' },
    { id: 'v-05', ttsText: '你最喜歡什麼動物？', displayText: '你最喜歡什麼動物？', image: '🐱🐶🐰🐟', minAge: '25-36m' },
    { id: 'v-06', ttsText: '今天天氣怎麼樣？', displayText: '今天天氣怎麼樣？', image: '☀️', minAge: '25-36m' },
    { id: 'v-07', ttsText: '這是什麼顏色？', displayText: '這是什麼顏色？', image: '🔴', imageLabel: '紅色', minAge: '25-36m' },
    { id: 'v-08', ttsText: '你早餐吃了什麼？', displayText: '你早餐吃了什麼？', image: '🍚🥛🍞', minAge: '37-48m' },
    { id: 'v-09', ttsText: '數到十', displayText: '從一數到十', minAge: '37-48m' },
    { id: 'v-10', ttsText: '說一個你知道的故事', displayText: '說一個你知道的故事', image: '📖', minAge: '49-60m' },
    { id: 'v-11', ttsText: '你的家裡有幾個人？他們是誰？', displayText: '你的家裡有幾個人？', image: '👨‍👩‍👧‍👦', minAge: '49-60m' },
  ];

  let currentPromptIndex = $state(0);
  let isRecording = $state(false);
  let isSpeaking = $state(false);
  let hasRecorded = $state(false);
  let isComplete = $state(false);
  let recordingStartTime = $state(0);
  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: Blob[] = [];
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let permissionGranted = $state(false);
  let permissionError = $state<string | null>(null);

  // Filter prompts by age group
  const ageOrder = ['2-6m', '7-12m', '13-24m', '25-36m', '37-48m', '49-60m', '61-72m'];
  const activePrompts = $derived.by(() => {
    const ag = assessmentStore.ageGroup;
    if (!ag) return [];
    const agIdx = ageOrder.indexOf(ag);
    return PROMPTS.filter(p => {
      const pIdx = ageOrder.indexOf(p.minAge);
      return pIdx <= agIdx;
    }).slice(0, 5); // Max 5 prompts
  });

  const currentPrompt = $derived(activePrompts[currentPromptIndex] ?? null);
  const progress = $derived(activePrompts.length > 0 ? currentPromptIndex / activePrompts.length : 0);

  // Check for very young children who skip voice module
  const skipVoice = $derived.by(() => {
    const level = assessmentStore.ageGroup ? instructionLevel(assessmentStore.ageGroup) : 'none';
    return level === 'none'; // 0-12 months skip voice
  });

  async function requestMicPermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      permissionGranted = true;
    } catch {
      permissionError = '無法存取麥克風，請確認瀏覽器權限設定。';
    }
  }

  async function playTTS(text: string) {
    isSpeaking = true;
    return new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-TW';
      utterance.rate = 0.85; // Slightly slower for children
      utterance.onend = () => { isSpeaking = false; resolve(); };
      utterance.onerror = () => { isSpeaking = false; resolve(); };
      speechSynthesis.speak(utterance);
    });
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000 } });
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        const duration = (Date.now() - recordingStartTime) / 1000;

        // Save media
        if (assessmentStore.assessment && assessmentStore.child) {
          await saveMedia({
            assessmentId: assessmentStore.assessment.id,
            childId: assessmentStore.child.id,
            fileType: 'voice',
            blob,
            mimeType: 'audio/webm',
            fileSize: blob.size,
            duration,
          });

          await recordEvent({
            assessmentId: assessmentStore.assessment.id,
            childId: assessmentStore.child.id,
            moduleType: 'voice',
            eventType: 'voice_end',
            timestamp: new Date(),
            data: {
              promptId: currentPrompt?.id,
              duration,
              fileSize: blob.size,
            },
          });
        }

        hasRecorded = true;
      };

      mediaRecorder.start();
      isRecording = true;
      recordingStartTime = Date.now();
      hasRecorded = false;

      // Record start event
      if (assessmentStore.assessment && assessmentStore.child) {
        await recordEvent({
          assessmentId: assessmentStore.assessment.id,
          childId: assessmentStore.child.id,
          moduleType: 'voice',
          eventType: 'voice_start',
          timestamp: new Date(),
          data: { promptId: currentPrompt?.id },
        });
      }

      // Auto-stop after 15 seconds
      silenceTimer = setTimeout(() => stopRecording(), 15000);
    } catch {
      permissionError = '錄音失敗，請重試。';
    }
  }

  function stopRecording() {
    if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
    isRecording = false;
  }

  async function handlePrompt() {
    if (!currentPrompt) return;
    await playTTS(currentPrompt.ttsText);
    await startRecording();
  }

  function nextPrompt() {
    hasRecorded = false;
    if (currentPromptIndex < activePrompts.length - 1) {
      currentPromptIndex++;
    } else {
      isComplete = true;
    }
  }

  function skipPrompt() {
    // Record skip event
    if (assessmentStore.assessment && assessmentStore.child && currentPrompt) {
      recordEvent({
        assessmentId: assessmentStore.assessment.id,
        childId: assessmentStore.child.id,
        moduleType: 'voice',
        eventType: 'voice_skip',
        timestamp: new Date(),
        data: { promptId: currentPrompt.id },
      });
    }
    nextPrompt();
  }
</script>

<div class="voice-module">
  {#if skipVoice}
    <div class="skip-notice">
      <h2>語音互動</h2>
      <p>此年齡層的兒童尚未發展語音互動能力，將自動跳過此步驟。</p>
      <button class="btn-next" onclick={() => assessmentStore.nextStep()}>繼續下一步 →</button>
    </div>
  {:else if isComplete}
    <div class="voice-complete">
      <div class="complete-icon">&#x1F3A4;</div>
      <h2>語音互動完成！</h2>
      <p>你的表現很棒！</p>
      <button class="btn-next" onclick={() => assessmentStore.nextStep()}>繼續下一步 →</button>
    </div>
  {:else if !permissionGranted}
    <div class="permission-prompt">
      <h2>語音互動</h2>
      <p>接下來需要使用麥克風錄製語音。</p>
      {#if permissionError}
        <p class="error">{permissionError}</p>
      {/if}
      <button class="btn-primary" onclick={requestMicPermission}>允許使用麥克風</button>
      <button class="btn-skip" onclick={() => assessmentStore.nextStep()}>跳過語音互動</button>
    </div>
  {:else if currentPrompt}
    <div class="prompt-area">
      <div class="progress-info">
        <div class="progress-bar"><div class="progress-fill" style="width: {progress * 100}%"></div></div>
        <span class="progress-label">{currentPromptIndex + 1} / {activePrompts.length}</span>
      </div>

      <div class="prompt-card">
        {#if currentPrompt.image}
          <div class="prompt-image" aria-hidden="true">{currentPrompt.image}</div>
        {/if}
        <p class="prompt-text">{currentPrompt.displayText}</p>

        {#if isRecording}
          <div class="recording-indicator">
            <span class="rec-dot"></span>
            <span>錄音中…</span>
          </div>
          <button class="btn-stop" onclick={stopRecording}>停止錄音</button>
        {:else if hasRecorded}
          <p class="recorded-notice">已錄製完成！</p>
          <div class="prompt-actions">
            <button class="btn-retry" onclick={handlePrompt}>重新錄製</button>
            <button class="btn-next" onclick={nextPrompt}>下一題 →</button>
          </div>
        {:else if isSpeaking}
          <p class="speaking-notice">正在播放指令…</p>
        {:else}
          <button class="btn-primary" onclick={handlePrompt}>播放指令 + 開始錄音</button>
          <button class="btn-skip-prompt" onclick={skipPrompt}>跳過此題</button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .voice-module {
    max-width: 480px;
    margin: 0 auto;
    padding: var(--space-6);
  }

  /* Skip notice & complete */
  .skip-notice,
  .voice-complete,
  .permission-prompt {
    text-align: center;
    padding: var(--space-8) 0;
  }

  .skip-notice h2,
  .voice-complete h2,
  .permission-prompt h2 {
    font-size: var(--text-2xl);
    margin-bottom: var(--space-3);
  }

  .skip-notice p,
  .voice-complete p,
  .permission-prompt p {
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
    font-size: var(--text-sm);
    margin-bottom: var(--space-6);
  }

  .complete-icon {
    /* design-system-allow: emoji icon, 56px above token scale; no text token suitable */
    font-size: 56px;
    margin-bottom: var(--space-4);
  }

  /* Progress */
  .progress-info {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-6);
  }

  .progress-bar {
    flex: 1;
    height: 8px;
    background: color-mix(in srgb, var(--bg), var(--text) 5%);
    border-radius: var(--radius-full);
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--accent);
    border-radius: var(--radius-full);
    transition: width 0.3s ease;
  }

  .progress-label {
    font-size: var(--text-xs);
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
    white-space: nowrap;
  }

  /* Prompt card */
  .prompt-card {
    text-align: center;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    padding: var(--space-8) var(--space-6);
  }

  .prompt-image {
    /* design-system-allow: emoji prompt image, 96px above token scale; no text token suitable */
    font-size: 96px;
    line-height: 1;
    margin-bottom: var(--space-4);
  }

  .prompt-text {
    font-size: var(--text-xl);
    font-weight: var(--font-bold);
    color: var(--text);
    margin-bottom: var(--space-6);
    line-height: var(--lh-xl);
  }

  /* Recording indicator */
  .recording-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--danger);
    margin-bottom: var(--space-4);
  }

  .rec-dot {
    display: inline-block;
    width: 12px;
    height: 12px;
    background: var(--danger);
    border-radius: var(--radius-full);
    animation: pulse-rec 1s ease-in-out infinite;
  }

  @keyframes pulse-rec {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(1.3); }
  }

  .speaking-notice {
    font-size: var(--text-sm);
    color: var(--accent);
    font-weight: var(--font-medium);
  }

  .recorded-notice {
    font-size: var(--text-sm);
    color: var(--accent);
    font-weight: var(--font-medium);
    margin-bottom: var(--space-4);
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
  }

  .btn-next:hover {
    background: color-mix(in srgb, var(--accent) 85%, black);
  }

  .btn-stop {
    width: 100%;
    padding: var(--space-4);
    background: var(--danger);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-bold);
    cursor: pointer;
    min-height: 56px;
  }

  .btn-stop:hover {
    opacity: 0.9;
  }

  .btn-retry {
    flex: 1;
    padding: var(--space-3);
    background: none;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
    font-size: var(--text-sm);
    cursor: pointer;
    min-height: 56px;
  }

  .btn-retry:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .prompt-actions {
    display: flex;
    gap: var(--space-3);
  }

  .prompt-actions .btn-next {
    flex: 1;
  }

  .btn-skip,
  .btn-skip-prompt {
    width: 100%;
    padding: var(--space-3);
    background: none;
    border: none;
    color: color-mix(in srgb, var(--text), var(--bg) 45%);
    font-size: var(--text-xs);
    cursor: pointer;
    min-height: 44px;
  }

  .btn-skip:hover,
  .btn-skip-prompt:hover {
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
  }

  .error {
    color: var(--danger);
    font-size: var(--text-sm);
    margin-bottom: var(--space-4);
  }
</style>
