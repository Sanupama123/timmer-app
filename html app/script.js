
/**
 * Multi-instance Timer with:
 *  - Count Up / Count Down modes
 *  - Newest lap on top (reverse order)
 *  - Gradient progress stroke via SVG <defs>
 *  - Alarm on countdown finish
 *
 * Each container needs:
 *  [data-timer], [data-start], [data-pause], [data-lap], [data-reset]
 *  [data-status], [data-paused], [data-laps], [data-clear-laps]
 *  [data-mode], [data-target], [data-apply]
 *  .ring-progress (SVG circle with r attribute)
 */

class TimerApp {
  constructor(root, shared) {
    this.root = root;

    // Core
    this.seconds = 0;         // up: elapsed; down: remaining
    this.isRunning = false;
    this.interval = null;

    // Mode & target
    this.mode = "up";         // "up" or "down"
    this.targetSeconds = 600; // 10:00
    this.finished = false;

    // Laps
    this.laps = [];
    this.lastLapBasis = 0;

    // Elements
    this.timerEl   = root.querySelector("[data-timer]");
    this.startBtn  = root.querySelector("[data-start]");
    this.pauseBtn  = root.querySelector("[data-pause]");
    this.lapBtn    = root.querySelector("[data-lap]");
    this.resetBtn  = root.querySelector("[data-reset]");
    this.statusEl  = root.querySelector("[data-status]");
    this.pausedBadge = root.querySelector("[data-paused]");

    this.lapsEl    = root.querySelector("[data-laps]");
    this.clearLapsBtn = root.querySelector("[data-clear-laps]");

    this.modeSel   = root.querySelector("[data-mode]");
    this.targetInput = root.querySelector("[data-target]");
    this.applyBtn  = root.querySelector("[data-apply]");

    this.progressCircle = root.querySelector(".ring-progress");

    // Shared UI
    this.toastEl  = shared.toastEl;
    this.rippleEl = shared.rippleEl;
    this.beepEl   = shared.beepEl;

    // SVG circumference (match r attribute; default 70)
    this.R = parseFloat(this.progressCircle.getAttribute("r")) || 70;
    this.CIRC = 2 * Math.PI * this.R;
    this.progressCircle.style.strokeDasharray = this.CIRC.toFixed(2);
    this.progressCircle.style.strokeDashoffset = this.CIRC.toFixed(2);

    // Events
    this.startBtn.addEventListener("click", (e)=> this.start(e));
    this.pauseBtn.addEventListener("click", ()=> this.pause());
    this.lapBtn.addEventListener("click", ()=> this.addLap());
    this.resetBtn.addEventListener("click", ()=> this.reset());
    this.clearLapsBtn.addEventListener("click", ()=> this.clearLaps());

    this.modeSel.addEventListener("change", ()=> this.changeMode());
    this.applyBtn.addEventListener("click", ()=> this.applyTarget());

    // Keyboard shortcuts per card
    this.root.addEventListener("keydown", (e)=>{
      const k = e.key.toLowerCase();
      if (e.code === "Space"){
        e.preventDefault();
        this.isRunning ? this.pause() : this.start();
      } else if (k === "r"){
        this.reset();
      } else if (k === "l"){
        this.addLap();
      }
    });

    // Init
    this.updateDisplay();
    this.enableControls({start:true, pause:false, lap:false, reset:false});
  }

  /* ----- Utils ----- */
  formatTime(total) {
    const m = Math.floor(total/60);
    const s = total%60;
    return String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");
  }

  parseTime(str){
    const parts = (str||"").trim().split(":");
    if (parts.length !== 2) return null;
    const mm = parseInt(parts[0],10);
    const ss = parseInt(parts[1],10);
    if (Number.isNaN(mm) || Number.isNaN(ss) || mm<0 || ss<0 || ss>59) return null;
    return mm*60 + ss;
  }

  showStatus(text){ this.statusEl.textContent = text; }

  showToast(msg, timeout=1500){
    if (!this.toastEl) return;
    this.toastEl.textContent = msg;
    this.toastEl.classList.add("show");
    setTimeout(()=> this.toastEl.classList.remove("show"), timeout);
  }

  playBeep(){
    try{
      this.beepEl.currentTime = 0;
      this.beepEl.play().catch(()=>{});
    }catch(e){}
  }

  showRipple(x, y){
    if (!this.rippleEl) return;
    this.rippleEl.style.left = `${x}px`;
    this.rippleEl.style.top  = `${y}px`;
    this.rippleEl.classList.add("show");
    setTimeout(()=> this.rippleEl.classList.remove("show"), 600);
  }

  enableControls({start, pause, lap, reset}){
    this.startBtn.disabled = !start;
    this.pauseBtn.disabled = !pause;
    this.lapBtn.disabled   = !lap;
    this.resetBtn.disabled = !reset;
  }

  /* ----- Mode / Target ----- */
  changeMode(){
    if (this.isRunning){
      this.showToast("Pause to change mode");
      this.modeSel.value = this.mode; // revert UI
      return;
    }
    this.mode = this.modeSel.value;
    this.finished = false;
    if (this.mode === "down"){
      this.seconds = this.targetSeconds; // remaining
      this.lastLapBasis = 0;
      this.showStatus("Ready (Countdown)");
    } else {
      this.lastLapBasis = 0;
      this.showStatus("Ready");
    }
    this.updateDisplay();
  }

  applyTarget(){
    const secs = this.parseTime(this.targetInput.value);
    if (secs == null){
      this.showToast("Invalid target (use mm:ss)");
      return;
    }
    this.targetSeconds = secs;
    if (this.mode === "down"){
      this.seconds = this.targetSeconds;
      this.finished = false;
      this.lastLapBasis = 0;
      this.updateDisplay();
      this.showStatus("Ready (Countdown)");
    }
    this.showToast(`Target set to ${this.formatTime(this.targetSeconds)}`);
  }

  /* ----- Display & ring progress ----- */
  updateDisplay() {
    this.timerEl.textContent = this.formatTime(Math.max(0, this.seconds));

    let offset;
    if (this.mode === "down" && this.targetSeconds > 0){
      const elapsed = this.targetSeconds - Math.max(0, this.seconds);
      const frac = Math.min(1, Math.max(0, elapsed / this.targetSeconds));
      offset = this.CIRC - frac * this.CIRC;
    } else {
      const secInMinute = this.seconds % 60;
      const frac = secInMinute / 60;
      offset = this.CIRC - frac * this.CIRC;
    }
    this.progressCircle.style.strokeDashoffset = offset.toFixed(2);
  }

  /* ----- Actions ----- */
  start(e){
    if (this.isRunning) return;
    if (this.mode === "down" && this.seconds <= 0){
      this.showToast("Set target & Apply before starting");
      return;
    }

    this.isRunning = true;
    if (e){ this.showRipple(e.clientX, e.clientY); }
    this.showStatus(this.mode === "down" ? "Counting down…" : "Running…");
    this.pausedBadge.hidden = true;
    this.enableControls({start:false, pause:true, lap:true, reset:true});

    this.interval = setInterval(()=>{
      if (this.mode === "up"){
        this.seconds++;
        this.updateDisplay();
      } else {
        if (this.seconds > 0){
          this.seconds--;
          this.updateDisplay();
          if (this.seconds === 0){
            this.finishCountdown();
          }
        }
      }
    }, 1000);

    this.showToast("Timer started");
  }

  pause(){
    if (!this.isRunning) return;
    clearInterval(this.interval);
    this.isRunning = false;

    this.showStatus("Paused");
    this.pausedBadge.hidden = false;
    this.enableControls({start:true, pause:false, lap:false, reset:true});
    this.showToast("Timer paused");
  }

  reset(){
    clearInterval(this.interval);
    this.isRunning = false;
    this.finished = false;

    if (this.mode === "down"){
      this.seconds = this.targetSeconds;
    } else {
      this.seconds = 0;
    }
    this.lastLapBasis = 0;
    this.updateDisplay();

    this.progressCircle.classList.add("reset-anim");
    setTimeout(()=> this.progressCircle.classList.remove("reset-anim"), 300);

    this.showStatus(this.mode === "down" ? "Ready (Countdown)" : "Ready");
    this.pausedBadge.hidden = true;
    this.enableControls({start:true, pause:false, lap:false, reset:false});
    this.clearLaps();
    this.showToast("Timer reset");
  }

  finishCountdown(){
    clearInterval(this.interval);
    this.isRunning = false;
    this.finished = true;
    this.showStatus("Finished");
    this.pausedBadge.hidden = true;
    this.enableControls({start:true, pause:false, lap:false, reset:true});
    this.playBeep();
    this.showToast("Time’s up!");
  }

  /* ----- Laps (Newest on top) ----- */
  addLap(){
    if (!this.isRunning) return;

    // Lap basis: elapsed (up) OR elapsed vs target (down)
    const basisTotal = (this.mode === "up")
      ? this.seconds
      : (this.targetSeconds - this.seconds);

    const index = this.laps.length + 1;
    const diff  = basisTotal - this.lastLapBasis;
    this.lastLapBasis = basisTotal;

    const lapItem = { index, total: basisTotal, diff };
    this.laps.push(lapItem);
    this.renderLap(lapItem);

    this.showToast(`Lap ${index} recorded`);
  }

  renderLap({index, total, diff}){
    const li = document.createElement("li");

    const idx = document.createElement("span");
    idx.className = "lap-index";
    idx.textContent = `#${index}`;

    const time = document.createElement("span");
    time.className = "lap-time";
    time.textContent = this.formatTime(total);

    const delta = document.createElement("span");
    delta.className = "lap-diff";
    delta.textContent = `+${this.formatTime(Math.max(0, diff))}`;

    li.appendChild(idx);
    li.appendChild(time);
    li.appendChild(delta);

    // Newest on top
    if (this.lapsEl.firstChild){
      this.lapsEl.insertBefore(li, this.lapsEl.firstChild);
    } else {
      this.lapsEl.appendChild(li);
    }
    this.lapsEl.scrollTop = 0;
  }

  clearLaps(){
    this.laps = [];
    this.lastLapBasis = (this.mode === "up") ? this.seconds : (this.targetSeconds - this.seconds);
    if (this.lapsEl) this.lapsEl.innerHTML = "";
  }
}

/* ---- Boot both instances ---- */
document.addEventListener("DOMContentLoaded",()=>{
  const toastEl  = document.getElementById("toast");
  const rippleEl = document.getElementById("ripple");
  const beepEl   = document.getElementById("beep");

  const shared = { toastEl, rippleEl, beepEl };

  const desktopContainer = document.querySelector(".container--desktop");
  const phoneContainer   = document.querySelector(".container--phone");

  desktopContainer.setAttribute("tabindex","0");
  phoneContainer.setAttribute("tabindex","0");

  new TimerApp(desktopContainer, shared);
  new TimerApp(phoneContainer, shared);
});
