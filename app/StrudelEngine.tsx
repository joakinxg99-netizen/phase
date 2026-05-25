"use client";

import { useRef, useState } from "react";

export default function StrudelEngine() {
  const schedulerRef = useRef<any>(null);
  const [status, setStatus] = useState("idle");

  async function play() {
    try {
      setStatus("loading");

      const strudel = await import("@strudel/web");

      if (!schedulerRef.current) {
        await strudel.initStrudel();

        schedulerRef.current = strudel.scheduler;
      }

      schedulerRef.current.stop();

      schedulerRef.current.setPattern(
        strudel.s("bd hh sd hh").fast(2).gain(0.9)
      );

      schedulerRef.current.start();

      setStatus("playing");
    } catch (err) {
      console.error("STRUDEL ERROR:", err);
      setStatus("error");
    }
  }

  function stop() {
    try {
      schedulerRef.current?.stop();
      setStatus("stopped");
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 20,
        right: 20,
        zIndex: 9999,
        background: "rgba(10,10,10,0.95)",
        border: "1px solid rgba(255,255,255,0.12)",
        padding: 16,
        borderRadius: 14,
        display: "flex",
        gap: 10,
        alignItems: "center",
        color: "white",
      }}
    >
      <button
        onClick={play}
        style={{
          background: "#8b5cf6",
          color: "white",
          border: "none",
          padding: "10px 16px",
          borderRadius: 10,
          cursor: "pointer",
          fontWeight: 700,
        }}
      >
        Play Strudel
      </button>

      <button
        onClick={stop}
        style={{
          background: "transparent",
          color: "white",
          border: "1px solid rgba(255,255,255,0.2)",
          padding: "10px 16px",
          borderRadius: 10,
          cursor: "pointer",
        }}
      >
        Stop
      </button>

      <span style={{ opacity: 0.7, fontSize: 13 }}>{status}</span>
    </div>
  );
}