import React, { useEffect, useRef, useState } from 'react';
import { fetchAllPSXPrices } from '../services/psxData';
import { jointCandleSides, mixTopMovers, type HeroMover } from '../utils/heroMovers';

const REFRESH_MS = 5 * 60 * 1000;

const pctLabel = (pct: number) => `${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(2)}%`;

/** Floating KSE-100 gainers and losers for the public landing hero. */
export const HeroMovers: React.FC = () => {
  const [items, setItems] = useState<HeroMover[]>([]);
  const fieldRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const data = await fetchAllPSXPrices();
        const rows = Object.entries(data).flatMap(([ticker, quote]) => {
          if (!quote || quote.price <= 0 || quote.ldcp <= 0) return [];
          return [{
            ticker,
            price: quote.price,
            change: ((quote.price - quote.ldcp) / quote.ldcp) * 100,
            volume: quote.volume || 0,
            high: quote.high || 0,
            low: quote.low || 0,
            listedIn: quote.listedIn || '',
          }];
        });
        if (!stop) setItems(mixTopMovers(rows));
      } catch {
        /* Leave the hero empty rather than show stale or invented moves. */
      }
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => { stop = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    const field = fieldRef.current;
    const canvas = canvasRef.current;
    if (!field || !canvas || items.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pointer = { x: -9999, y: -9999, active: false };
    const chips = Array.from(field.querySelectorAll<HTMLElement>('[data-mover]'));
    const rect = () => field.getBoundingClientRect();
    const box = rect();
    const nodes = chips.map(el => {
      const angle = Math.random() * Math.PI * 2;
      return {
        el,
        up: el.dataset.up === '1',
        x: 40 + Math.random() * Math.max(80, box.width - 160),
        y: 24 + Math.random() * Math.max(80, box.height - 80),
        vx: Math.cos(angle) * 0.45,
        vy: Math.sin(angle) * 0.45,
        w: el.offsetWidth || 96,
        h: el.offsetHeight || 26,
      };
    });

    let sizedW = 0;
    let sizedH = 0;
    const paint = () => {
      const view = rect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const nextW = Math.floor(view.width * dpr);
      const nextH = Math.floor(view.height * dpr);
      if (nextW !== sizedW || nextH !== sizedH) {
        sizedW = nextW;
        sizedH = nextH;
        canvas.width = nextW;
        canvas.height = nextH;
        canvas.style.width = `${view.width}px`;
        canvas.style.height = `${view.height}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, view.width, view.height);
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const ax = a.x + a.w / 2;
          const ay = a.y + a.h / 2;
          const bx = b.x + b.w / 2;
          const by = b.y + b.h / 2;
          const dx = ax - bx;
          const dy = ay - by;
          const dist2 = dx * dx + dy * dy;
          if (dist2 >= 32400) continue;
          const alpha = (1 - Math.sqrt(dist2) / 180) * 0.35;
          ctx.strokeStyle = `rgba(33,137,173,${alpha})`;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
          const mx = (ax + bx) / 2;
          const my = (ay + by) / 2;
          const sides = jointCandleSides(a.up, b.up);
          sides.forEach((side, index) => {
            const x = mx + (sides.length === 1 ? 0 : index === 0 ? -6 : 6);
            const color = side === 'up' ? '#059669' : '#e11d48';
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = 1.25;
            ctx.beginPath();
            ctx.moveTo(x, my - 9);
            ctx.lineTo(x, my + 9);
            ctx.stroke();
            ctx.fillRect(x - 2.5, my - 4, 5, 8);
          });
        }
      }
      if (pointer.active) {
        for (const node of nodes) {
          const dx = node.x - pointer.x;
          const dy = node.y - pointer.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 >= 48400) continue;
          const alpha = (1 - Math.sqrt(dist2) / 220) * 0.55;
          ctx.strokeStyle = `rgba(27,113,145,${alpha})`;
          ctx.beginPath();
          ctx.moveTo(node.x + node.w / 2, node.y + node.h / 2);
          ctx.lineTo(pointer.x, pointer.y);
          ctx.stroke();
        }
      }
      nodes.forEach(node => {
        node.el.style.transform = `translate(${node.x}px, ${node.y}px)`;
      });
    };

    const step = () => {
      const view = rect();
      for (const node of nodes) {
        if (pointer.active) {
          const dx = pointer.x - (node.x + node.w / 2);
          const dy = pointer.y - (node.y + node.h / 2);
          const dist2 = dx * dx + dy * dy;
          if (dist2 < 48400) {
            const dist = Math.sqrt(dist2) || 1;
            const pull = (1 - dist / 220) * 0.08;
            node.vx += (dx / dist) * pull;
            node.vy += (dy / dist) * pull;
          }
        }
        node.x += node.vx;
        node.y += node.vy;
        node.vx *= 0.985;
        node.vy *= 0.985;
        let speed = Math.hypot(node.vx, node.vy);
        if (speed < 0.35) {
          const scale = speed < 0.001 ? 0 : 0.35 / speed;
          if (scale === 0) {
            const angle = Math.random() * Math.PI * 2;
            node.vx = 0.35 * Math.cos(angle);
            node.vy = 0.35 * Math.sin(angle);
          } else {
            node.vx *= scale;
            node.vy *= scale;
          }
          speed = 0.35;
        }
        if (speed > 1.15) {
          node.vx *= 1.15 / speed;
          node.vy *= 1.15 / speed;
        }
        for (const other of nodes) {
          if (other === node) continue;
          const ox = other.x - node.x;
          const oy = other.y - node.y;
          const apart = ox * ox + oy * oy;
          if (apart > 0 && apart < 14400) {
            const dist = Math.sqrt(apart);
            const push = (120 - dist) / 120 * 0.35;
            node.vx -= (ox / dist) * push;
            node.vy -= (oy / dist) * push;
          }
        }
        if (node.x < 8) node.x = view.width - node.w - 8;
        if (node.x > view.width - 8) node.x = 8;
        if (node.y < 8) node.y = view.height - node.h - 8;
        if (node.y > view.height - 8) node.y = 8;
      }
      paint();
      frame = requestAnimationFrame(step);
    };

    const onMove = (event: PointerEvent) => {
      const view = rect();
      pointer.x = event.clientX - view.left;
      pointer.y = event.clientY - view.top;
      pointer.active = pointer.x >= 0 && pointer.y >= 0 && pointer.x <= view.width && pointer.y <= view.height;
    };
    const onLeave = (event: PointerEvent) => {
      if (event.relatedTarget == null) pointer.active = false;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerout', onLeave);
    let frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerout', onLeave);
    };
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div
      ref={fieldRef}
      className="absolute left-0 right-0 top-0 overflow-hidden pointer-events-none"
      style={{ left: 0, right: 0, width: '100%', height: 'min(92vh, 760px)' }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {items.map(item => (
        <span
          key={item.ticker}
          data-mover=""
          data-up={item.up ? '1' : '0'}
          className="absolute left-0 top-0 -translate-x-[9999px]"
        >
          <span className={`flex items-center gap-1.5 rounded-[10px] border px-1.5 py-0.5 text-[10px] font-bold shadow-sm whitespace-nowrap ${
            item.up
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
              : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200'
          }`}>
            <span className="h-1 w-1 rounded-full bg-current" />
            <b className="font-extrabold tracking-wide">{item.ticker}</b>
            <em className="not-italic tabular-nums">{pctLabel(item.pct)}</em>
          </span>
        </span>
      ))}
    </div>
  );
};
