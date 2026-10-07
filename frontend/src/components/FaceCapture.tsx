import React from 'react';
import { motion } from 'framer-motion';
import * as faceapi from 'face-api.js';

type Props = {
  enabled: boolean;
  onDescriptor: (descriptor: number[]) => void;
};

async function tryLoadModels() {
  const base = '/models';
  await Promise.all([
    faceapi.nets.mtcnn.loadFromUri(base),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri(base),
    faceapi.nets.faceRecognitionNet.loadFromUri(base),
  ]);
}

function buildFrameDescriptor(video: HTMLVideoElement) {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Array.from({ length: 64 }, () => 0);

  ctx.drawImage(video, 0, 0, size, size);
  const pixels = ctx.getImageData(0, 0, size, size).data;

  const descriptor: number[] = [];
  const bins = 64;
  const step = Math.floor((size * size) / bins);

  for (let b = 0; b < bins; b += 1) {
    let sum = 0;
    for (let i = b * step; i < (b + 1) * step; i += 1) {
      const p = i * 4;
      const gray = (pixels[p] + pixels[p + 1] + pixels[p + 2]) / 3;
      sum += gray;
    }
    const avg = sum / step;
    descriptor.push((avg - 127.5) / 127.5);
  }

  return descriptor;
}

export default function FaceCapture({ enabled, onDescriptor }: Props) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const rafRef = React.useRef<number>(0);

  const [status, setStatus] = React.useState<'idle' | 'loading' | 'ready' | 'no-face' | 'captured' | 'error'>(
    'idle'
  );
  const [errText, setErrText] = React.useState('');
  const [modelsOk, setModelsOk] = React.useState(false);
  const [cameraOn, setCameraOn] = React.useState(false);
  const [capturedAt, setCapturedAt] = React.useState<string>('');

  React.useEffect(() => {
    let mounted = true;

    const loadModels = async () => {
      if (!enabled) return;
      try {
        await tryLoadModels();
        if (!mounted) return;
        setModelsOk(true);
      } catch (_) {
        if (!mounted) return;
        // Models missing: we still allow capture, but descriptor will be simulated.
        setModelsOk(false);
      }
    };

    loadModels();

    return () => {
      mounted = false;
      cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [enabled]);

  const stopCamera = React.useCallback((keepStatus = false) => {
    cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOn(false);
    if (!keepStatus) {
      setStatus(enabled ? 'idle' : 'idle');
    }
  }, [enabled]);

  const startCamera = async () => {
    if (!enabled || cameraOn || status === 'captured') return;
    setErrText('');
    setStatus('loading');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraOn(true);
      setStatus('ready');

      const tick = () => {
        if (!videoRef.current || !canvasRef.current) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        const v = videoRef.current;
        const c = canvasRef.current;
        const w = v.videoWidth || 640;
        const h = v.videoHeight || 360;
        c.width = w;
        c.height = h;

        const ctx = c.getContext('2d');
        if (!ctx) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        ctx.clearRect(0, 0, w, h);
        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    } catch (e: any) {
      setStatus('error');
      setErrText(e?.message || 'Camera permission or device error');
      stopCamera(true);
    }
  };

  const resetCapture = () => {
    setCapturedAt('');
    setErrText('');
    setStatus(cameraOn ? 'ready' : 'idle');
  };

  const capture = async () => {
    if (!videoRef.current || !cameraOn || status === 'captured') return;

    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width || 0, canvasRef.current.height || 0);
      }
    }

    if (!modelsOk) {
      // Simulated descriptor (demo) if models are not available.
      const descriptor = buildFrameDescriptor(videoRef.current);
      onDescriptor(descriptor);
      setStatus('captured');
      setCapturedAt(new Date().toLocaleTimeString());
      stopCamera(true);
      return;
    }

    const det = await faceapi
      .detectSingleFace(
        videoRef.current,
        new faceapi.MtcnnOptions({ minFaceSize: 80, scaleFactor: 0.709, scoreThresholds: [0.6, 0.7, 0.7] })
      )
      .withFaceLandmarks(true)
      .withFaceDescriptor();

    if (!det) {
      setStatus('no-face');
      return;
    }

    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        const { x, y, width, height } = det.detection.box;
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.85)';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, width, height);
      }
    }

    onDescriptor(Array.from(det.descriptor));
    setStatus('captured');
    setCapturedAt(new Date().toLocaleTimeString());
    stopCamera(true);
  };

  const statusLabel = !enabled
    ? 'locked'
    : status === 'idle'
      ? 'camera off'
      : status;

  return (
    <div className={`glass rounded-2xl p-4 border ${enabled ? 'border-emerald-500/30' : 'border-white/20'}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Live Face Capture</div>
          <div className="text-xs opacity-70 mt-1">Camera starts only when you click start. Uses MTCNN for face detection.</div>
        </div>
        <div className="badge">{statusLabel}</div>
      </div>

      <div className="mt-4 aspect-video rounded-2xl overflow-hidden bg-white/20 relative">
        {!cameraOn ? (
          <div className="absolute inset-0 grid place-items-center text-sm opacity-75">
            Camera is off. Click Start Camera to begin.
          </div>
        ) : null}
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover opacity-90" playsInline muted />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        <motion.div
          className="absolute inset-0 border border-white/20 rounded-2xl"
          animate={{ opacity: cameraOn ? [0.55, 0.9, 0.55] : [0.2, 0.3, 0.2] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        />
      </div>

      {errText ? <div className="mt-3 text-sm text-rose-500">{errText}</div> : null}
      {status === 'captured' ? (
        <div className="mt-3 text-sm text-emerald-300">
          Face image captured successfully{capturedAt ? ` at ${capturedAt}` : ''}. Capture is now locked until reset.
        </div>
      ) : null}
      {!modelsOk ? (
        <div className="mt-3 text-xs opacity-70">
          Face models not found in <span className="font-medium">/public/models</span>. Using a simulated descriptor.
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-ghost" disabled={!enabled || cameraOn || status === 'captured'} onClick={startCamera}>
          Start Camera
        </button>
        <button className="btn-primary" disabled={!enabled || !cameraOn || status === 'captured'} onClick={capture}>
          {status === 'captured' ? 'Captured' : 'Capture Face'}
        </button>
        <button className="btn-ghost" disabled={!enabled || status !== 'captured'} onClick={resetCapture}>
          Reset Capture
        </button>
      </div>
    </div>
  );
}
