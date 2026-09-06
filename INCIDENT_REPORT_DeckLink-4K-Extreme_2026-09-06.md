# Incident Investigation & Post-Mortem Report

| **Metadata** | **Details** |
| :--- | :--- |
| **Incident ID** | INC-20260906-BMD-CAPTURE |
| **Date & Time** | 2026-09-06 02:28:23 UTC (08:13:23 Local) |
| **Device / Stream** | Blackmagic DeckLink 4K Extreme (`device/DeckLink-4K-Extreme`) |
| **Source Signal** | SDI Ingest (1080i50 / `Hi50`, 8-Channel Embedded Audio) |
| **Target Output(s)** | `DeckLink-4K-Extreme_2026-09-06_02-28-23.mov`<br>`DeckLink-4K-Extreme_2026-09-06_02-28-23.mxf` |
| **Session Duration** | 00:47:54 (2874.2 seconds) |
| **Playable Media** | 00:14:17 (857.9 seconds) in MXF; 00:00:00 in MOV (Corrupt/Purged) |
| **Report Status** | RESOLVED — ROOT CAUSE IDENTIFIED |

---

## 1. Executive Summary

On 2026-09-06 at 02:28:23 UTC, a recording session was initiated on the Blackmagic DeckLink 4K Extreme capture card with a total session elapsed duration of **47 minutes 54 seconds**. 

Upon stopping the recording, the UI presented the status:
> *"Incomplete capture: This capture is incomplete. The file contains 00:14:17 of playable media from a 00:47:54 recording session; preview and download can only include media actually written to disk."*

An investigation was conducted across Docker container logs, Linux kernel ring buffer (`dmesg`), disk space metrics, and FFmpeg execution parameters. The investigation confirmed:
1. **Linux OOM (Out of Memory) Killer was NOT triggered.**
2. **System disk space was NOT exhausted** (355 GB free space available).
3. **Hardware card and PCIe drivers were operational.**
4. **Primary Root Cause:** The recording session was configured to simultaneously encode two master formats: **Uncompressed 10-bit Video (`v210`) in QuickTime MOV** alongside **MPEG-2 50Mbps in MXF**, plus an HLS preview transcode. The uncompressed `v210` stream generated **1.11 Gbps (~138 MB/s)** of continuous I/O throughput, creating a severe disk write bottleneck (`speed=0.93x`). This triggered continuous **DeckLink input buffer overruns**, choked FFmpeg's internal multiplexing queue at 00:14:17 for the MXF stream, and corrupted the 353 GB MOV file.

---

## 2. Root Cause Analysis (RCA)

### A. Uncompressed `v210` Stream I/O Saturation
The session spawned FFmpeg with two simultaneous recording targets:
* **Output #0:** `/app/media/recordings/DeckLink-4K-Extreme_2026-09-06_02-28-23.mov`
  * Codec: `v210` (Uncompressed 10-bit 4:2:2 video)
  * Bitrate: **1,105,920 kbps (1.11 Gbps)**
  * Required Sustained Disk Write Speed: **~138 MB/second**
* **Output #1:** `/app/media/recordings/DeckLink-4K-Extreme_2026-09-06_02-28-23.mxf`
  * Codec: `mpeg2video` (XDCAM HD422 @ 50 Mbps)
  * Required Write Speed: **~6.25 MB/second**
* **Output #2:** HLS Device Live Preview (Realtime CPU x264 transcode)

### B. Encoding Speed Drop Below Real-Time (`speed=0.93x`)
Because SDI video arrives from the Blackmagic card in strict real-time (25 frames/second = 40 ms per frame), FFmpeg must process and flush frames at $\ge 1.00\times$ speed. 
The log confirms that due to massive I/O load, FFmpeg's speed degraded to **`speed=0.93x`**:
```text
frame=66835 fps=23 size=361497088KiB time=00:44:30.59 bitrate=1108884.6kbits/s speed=0.93x elapsed=0:47:51.51
```
* Over the span of 44 minutes, `v210` alone dumped **361,497,088 KiB (~353 Gigabytes)** of raw video to disk.

### C. DeckLink Hardware Input Buffer Overrun
Because the host disk could not sink 138 MB/s in real-time, the Blackmagic driver buffer filled up and overflowed, resulting in recurring buffer drops:
```text
[in#0/decklink @ 0x5e781bd06d40] Decklink input buffer overrun!
Last message repeated 25 times
Last message repeated 23 times
```

### D. Why the MXF File Stopped at 00:14:17
In multi-output FFmpeg sessions, when one output (`.mov`) stalls the pipeline due to I/O block, internal packet queues (`-max_muxing_queue_size 8192`) for other outputs desynchronize. At approximately the 14-minute 17-second mark (857.9s), the MPEG-2 muxer starved and ceased receiving further packets.

### E. Fate of the 353 GB MOV File
QuickTime `.mov` containers store their track metadata index in the **`moov` atom** at the end of the file. Because FFmpeg was overwhelmed and halted before it could safely flush the trailing index:
```text
[Recording] Removed invalid output DeckLink-4K-Extreme_2026-09-06_02-28-23.mov: [mov,mp4,m4a,3gp,3g2,mj2 @ 0x5e9eef32fa40] moov atom not found
```
StreamOps media probe identified the MOV as unplayable (`moov atom not found`) and **automatically purged the corrupted 353 GB MOV file** to prevent server disk exhaustion.

The MXF container (which writes independent SMPTE frame headers) remained partially valid for the first 14m 17s. StreamOps safely preserved this file as:
```text
[Recording] Preserved incomplete output DeckLink-4K-Extreme_2026-09-06_02-28-23.mxf: 
Capture was incomplete: FFmpeg produced 857.9s of playable media during a 2874.2s recording session
```

---

## 3. Log Evidence & Verification

### Exact FFmpeg Spawning Command:
```json
[
  "-y", "-hide_banner", "-loglevel", "info", "-fflags", "+genpts+discardcorrupt",
  "-avoid_negative_ts", "make_zero", "-thread_queue_size", "2048",
  "-f", "decklink", "-format_code", "Hi50", "-video_input", "sdi",
  "-audio_input", "embedded", "-timecode_format", "rp188any",
  "-channels", "8", "-audio_depth", "32", "-raw_format", "uyvy422",
  "-i", "DeckLink 4K Extreme", "-max_muxing_queue_size", "8192",
  "-map", "0:v:0?", "-map", "0:a:0?", "-c:v", "v210", "-pix_fmt", "yuv422p10le",
  "-r", "25", "-s", "1920x1080", "-c:a", "pcm_s24le", "-f", "mov",
  "/app/media/recordings/DeckLink-4K-Extreme_2026-09-06_02-28-23.mov",
  "-map", "0:v:0?", "-map", "0:a:0?", "-vf", "fps=25:round=near,setfield=tff",
  "-c:v", "mpeg2video", "-pix_fmt", "yuv422p", "-r", "25", "-s", "1920x1080",
  "-b:v", "50M", "-c:a", "pcm_s24le", "-f", "mxf",
  "/app/media/recordings/DeckLink-4K-Extreme_2026-09-06_02-28-23.mxf"
]
```

### System Host Metrics (Post-Incident Verification):
* **Host Available Disk Space:** `355 GB` free on root `/` (`df -h`).
* **Kernel OOM:** No kernel out-of-memory killing events recorded (`dmesg`).
* **Subsequent Single-Format Capture (`04-48-28.mxf`):** Executed with MPEG-2 MXF only, completed with 100% success and 0 dropped frames.

---

## 4. Preventive Actions & Standard Operating Procedures (SOP)

1. **Avoid Uncompressed `v210` MOV for General Ingest:**
   * `v210` requires dedicated high-performance NVMe RAID arrays (>1.2 GB/s sustained write). Standard VPS SSDs or shared volumes cannot sustain uncompressed 10-bit SDI recording.
2. **Use Recommended Broadcast Presets:**
   * **Broadcast Master:** `MPEG-2 / XDCAM HD422 50Mbps (MXF)` (~6.25 MB/s).
   * **Distribution Master:** `H.264 / AVC MP4 (15-25 Mbps)` (~2-3 MB/s).
   * **High-End Intermediate:** `Apple ProRes 422 (MOV)` (~18-20 MB/s).
3. **Single Master Export During Live SDI Capture:**
   * Avoid selecting multiple simultaneous recording formats during live SDI capture unless high-speed multi-disk storage is explicitly mounted.
