/**
 * TradeClimb Logo — SVG recreation of the brand mark
 * Uses currentColor so it adapts to any parent color context
 */
const TradeClimbLogo = ({
  size = 32,
  className = '',
  withText = false,
  textSize = 'text-sm',
  textClassName = '',
  gap = 'gap-2.5',
}) => {
  return (
    <div className={`flex items-center ${gap} ${className}`}>
      {/* Mountain + trend-arrow mark */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 95"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="TradeClimb logo"
        role="img"
        style={{ display: 'block', flexShrink: 0 }}
      >
        {/* Outer mountain triangle (outline only) */}
        <path
          d="M50 6 L93 84 L7 84 Z"
          stroke="currentColor"
          strokeWidth="5.5"
          strokeLinejoin="miter"
          strokeLinecap="square"
          fill="none"
        />
        {/* Trend / chart line going up-right */}
        <polyline
          points="16,70 35,44 52,57 70,26"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Arrow head at the end of the trend line */}
        <polyline
          points="61,21 71,27 65,38"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>

      {withText && (
        <span
          className={`font-bold tracking-[0.14em] uppercase ${textSize} ${textClassName}`}
          style={{ letterSpacing: '0.14em' }}
        >
          TradeClimb
        </span>
      )}
    </div>
  );
};

export default TradeClimbLogo;
