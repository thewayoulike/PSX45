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
        vx: Math.cos(angle) * 0.12,
        vy: Math.sin(angle) * 0.12,
        w: el.offsetWidth || 96,
        h: el.offsetHeight || 26,
      };
    });

    let sizedW = 0;
    let sizedH = 0;
    const phoneQuery = window.matchMedia('(max-width: 767px)');
    let phone = phoneQuery.matches;
    const paint = () => {
      const view = rect();
      const dpr = phone ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      const linkReach = phone ? 110 : 180;
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
          if (dist2 >= linkReach * linkReach) continue;
          const alpha = (1 - Math.sqrt(dist2) / linkReach) * 0.35;
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
            ctx.fillRect(x - 2.5, side === 'up' ? my - 5 : my - 3, 5, 8);
          });
        }
      }
      if (pointer.active) {
        for (const node of nodes) {
          const dx = node.x - pointer.x;
          const dy = node.y - pointer.y;
          const dist2 = dx * dx + dy * dy;
          const reach = phone ? 160 : 220;
          if (dist2 >= reach * reach) continue;
          const alpha = (1 - Math.sqrt(dist2) / reach) * 0.55;
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
      const zones = [];
      const addZone = (selector: string, pad: number) => {
        const el = document.querySelector(selector);
        if (!el) return;
        const block = el.getBoundingClientRect();
        zones.push({
          left: block.left - view.left - pad,
          top: block.top - view.top - pad,
          right: block.right - view.left + pad,
          bottom: block.bottom - view.top + pad,
        });
      };
      if (phone) addZone('[data-hero-actions]', 8);
      else addZone('[data-hero-keepout]', 14);
      const pullReach = phone ? 160 : 220;
      const apartLimit = phone ? 19600 : 14400;
      const apartSpan = phone ? 140 : 120;
      for (const node of nodes) {
        if (pointer.active) {
          const dx = pointer.x - (node.x + node.w / 2);
          const dy = pointer.y - (node.y + node.h / 2);
          const dist2 = dx * dx + dy * dy;
          if (dist2 < pullReach * pullReach) {
            const dist = Math.sqrt(dist2) || 1;
            const pull = (1 - dist / pullReach) * 0.02;
            node.vx += (dx / dist) * pull;
            node.vy += (dy / dist) * pull;
          }
        }
        node.x += node.vx;
        node.y += node.vy;
        node.vx *= 0.985;
        node.vy *= 0.985;
        let speed = Math.hypot(node.vx, node.vy);
        if (speed < 0.1) {
          const scale = speed < 0.001 ? 0 : 0.1 / speed;
          if (scale === 0) {
            const angle = Math.random() * Math.PI * 2;
            node.vx = 0.1 * Math.cos(angle);
            node.vy = 0.1 * Math.sin(angle);
          } else {
            node.vx *= scale;
            node.vy *= scale;
          }
          speed = 0.1;
        }
        if (speed > 0.22) {
          node.vx *= 0.22 / speed;
          node.vy *= 0.22 / speed;
        }
        for (const other of nodes) {
          if (other === node) continue;
          const ox = other.x - node.x;
          const oy = other.y - node.y;
          const apart = ox * ox + oy * oy;
          if (apart > 0 && apart < apartLimit) {
            const dist = Math.sqrt(apart);
            const push = (apartSpan - dist) / apartSpan * (phone ? 0.42 : 0.35);
            node.vx -= (ox / dist) * push;
            node.vy -= (oy / dist) * push;
          }
        }
        if (node.x < 8) node.x = view.width - node.w - 8;
        if (node.x > view.width - 8) node.x = 8;
        if (node.y < 8) node.y = view.height - node.h - 8;
        if (node.y > view.height - 8) node.y = 8;
        for (const zone of zones) {
          const hit = node.x < zone.right && node.x + node.w > zone.left && node.y < zone.bottom && node.y + node.h > zone.top;
          if (!hit) continue;
          const fromLeft = node.x + node.w - zone.left;
          const fromRight = zone.right - node.x;
          const fromTop = node.y + node.h - zone.top;
          const fromBottom = zone.bottom - node.y;
          const nearest = Math.min(fromLeft, fromRight, fromTop, fromBottom);
          if (nearest === fromLeft) {
            node.x = zone.left - node.w;
            node.vx = -Math.abs(node.vx);
          } else if (nearest === fromRight) {
            node.x = zone.right;
            node.vx = Math.abs(node.vx);
          } else if (nearest === fromTop) {
            node.y = zone.top - node.h;
            node.vy = -Math.abs(node.vy);
          } else {
            node.y = zone.bottom;
            node.vy = Math.abs(node.vy);
          }
        }
      }
      paint();
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
    const onPhone = () => {
      phone = phoneQuery.matches;
      sizedW = 0;
      nodes.forEach(node => {
        node.w = node.el.offsetWidth || node.w;
        node.h = node.el.offsetHeight || node.h;
      });
    };
    phoneQuery.addEventListener('change', onPhone);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerout', onLeave);
    let frame = 0;
    let running = true;
    const loop = () => {
      if (!running) return;
      step();
      frame = requestAnimationFrame(loop);
    };
    const seen = new IntersectionObserver(([entry]) => {
      const on = entry.isIntersecting;
      if (on && !running) {
        running = true;
        frame = requestAnimationFrame(loop);
      } else if (!on && running) {
        running = false;
        cancelAnimationFrame(frame);
      }
    });
    seen.observe(field);
    frame = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(frame);
      seen.disconnect();
      phoneQuery.removeEventListener('change', onPhone);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerout', onLeave);
    };
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div
      ref={fieldRef}
      className="hero-mover-field absolute left-0 right-0 top-0 overflow-hidden pointer-events-none"
      style={{ left: 0, right: 0, width: '100%' }}
      aria-hidden="true"
    >
      <style>{`
        .hero-mover-face {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px 4px 6px;
          border-radius: 10px;
          font-family: "Plus Jakarta Sans", Inter, sans-serif;
          font-size: 10px;
          line-height: 1;
          white-space: nowrap;
        }
        .hero-mover-face::before {
          content: "";
          width: 4px;
          height: 4px;
          border-radius: 99px;
          background: currentColor;
        }
        .hero-mover-face b { font-size: 10px; font-weight: 800; letter-spacing: 0.06em; }
        .hero-mover-face em { font-style: normal; font-size: 10px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
        .hero-mover-face.up {
          color: #047857;
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          box-shadow: 0 1px 0 rgba(255,255,255,0.8) inset, 0 4px 10px rgba(15,23,42,0.08);
        }
        .hero-mover-face.down {
          color: #be123c;
          background: #fff1f2;
          border: 1px solid #fecdd3;
          box-shadow: 0 1px 0 rgba(255,255,255,0.8) inset, 0 4px 10px rgba(15,23,42,0.08);
        }
        .hero-mover-face.up b { color: #064e3b; }
        .hero-mover-face.down b { color: #881337; }
        .dark .hero-mover-face.up {
          color: #6ee7b7;
          background: #064e3b;
          border-color: #065f46;
          box-shadow: 0 4px 12px rgba(0,0,0,0.35);
        }
        .dark .hero-mover-face.down {
          color: #fda4af;
          background: #881337;
          border-color: #9f1239;
          box-shadow: 0 4px 12px rgba(0,0,0,0.35);
        }
        .dark .hero-mover-face.up b { color: #ecfdf5; }
        .dark .hero-mover-face.down b { color: #fff1f2; }
        .hero-mover-field { height: min(92vh, 760px); }
        [data-mover] { will-change: transform; }
        @media (max-width: 767px) {
          .hero-mover-field { height: min(100svh, 680px); }
          .hero-mover-face { gap: 4px; padding: 3px 6px 3px 5px; font-size: 9px; }
          .hero-mover-face b, .hero-mover-face em { font-size: 9px; }
          .hero-mover-face::before { width: 3px; height: 3px; }
        }
      `}</style>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {items.map(item => (
        <span
          key={item.ticker}
          data-mover=""
          data-up={item.up ? '1' : '0'}
          className="absolute left-0 top-0 -translate-x-[9999px]"
        >
          <span className={`hero-mover-face ${item.up ? 'up' : 'down'}`}>
            <b>{item.ticker}</b>
            <em>{pctLabel(item.pct)}</em>
          </span>
        </span>
      ))}
    </div>
  );
};
