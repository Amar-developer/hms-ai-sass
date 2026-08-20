
/**
 * PageLoader
 * ----------
 * 12-blade fading "activity indicator" spinner (matches the exact
 * animation from the recorded reference clip).
 *
 * How the illusion works:
 *  - 12 identical blades are placed at 30deg increments around a circle.
 *  - Every blade runs the SAME opacity keyframe animation, but each one
 *    starts at a different point in that animation (via a negative
 *    animation-delay). That stagger is what makes it look like a single
 *    bright blade is chasing its own fading tail around the circle,
 *    instead of the whole ring just pulsing together.
 *
 * Usage:
 *   <PageLoader />                          -> full-page centered loader
 *   <PageLoader label="Loading records..." />
 *   <PageLoader fullScreen={false} size={48} /> -> inline / embedded loader
 */

const BLADE_COUNT = 12;

export function PageLoader({
  label,
  fullScreen = true,
  size = 64,
  color = "bg-slate-900/40",
}) {
  const blades = Array.from({ length: BLADE_COUNT });

  return (
    <div className={`${fullScreen ? "pl-fullscreen" : "pl-inline"} `}>
      <div
        className="pl-spinner"
        style={{ width: size, height: size }}
        role="status"
        aria-label={label || "Loading"}
      >
        {blades.map((_, i) => (
          <div
            key={i}
            className="pl-blade "
            style={{
              background: color,
              transform: `rotate(${i * (360 / BLADE_COUNT)}deg)`,
              animationDelay: `${(i * (1 / BLADE_COUNT) - 1).toFixed(3)}s`,
            }}
          />
        ))}
      </div>

      <div className="">{label && <p className="pl-label ">{label}</p>}</div>

      <style>{`
        .pl-fullscreen {
          position: fixed;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;

          /* Black overlay */
          background: rgba(156, 153, 153, 0.45);

          /* Blur everything behind the overlay */
          backdrop-filter: blur(1px);
          -webkit-backdrop-filter: blur(1px);

          z-index: 9999;
        }

        .pl-inline {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 24px;
        }

        .pl-spinner {
          position: relative;
        }

        .pl-blade {
          position: absolute;
          top: 0;
          left: 50%;
          width: 15%;
          aspect-ratio: 1;
          margin-left: -4%;
          margin: 10%;
          border-radius: 50%;
          background: #000;
          transform-origin: 50% 300%;
          animation: pl-fade 1s linear infinite;
        }

        @keyframes pl-fade {
          0% {
            opacity: 1;
          }
          100% {
            opacity: 0.15;
          }
        }

        .pl-label {
          margin: 0;
          font-size: 14px;
          font-weight: 500;
          color: #64748b;
        }
      `}</style>
    </div>
  );
}
