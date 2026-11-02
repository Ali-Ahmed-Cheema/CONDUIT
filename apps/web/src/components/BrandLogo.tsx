import type { ComponentPropsWithoutRef } from "react";

export function BrandLogo({ className, ...props }: ComponentPropsWithoutRef<"svg">) {
  return (
    <svg
      viewBox="0 0 1914 335"
      role="img"
      aria-label="CONDUIT"
      focusable="false"
      className={className}
      {...props}
    >
      <g transform="translate(-6 -10)">
        <path d="M58 14 L168 14 L216 64 L216 123 L170 123 L170 86 L148 61 L78 61 L56 83 L56 274 L78 296 L148 296 L170 274 L170 232 L216 232 L216 292 L168 341 L58 341 L10 292 L10 64 Z" fill="#FF3B30" stroke="#000000" strokeWidth="8" strokeLinejoin="miter" strokeMiterlimit="8" />
        <path fillRule="evenodd" d="M320 14 L440 14 L490 64 L490 292 L440 341 L320 341 L270 292 L270 64 Z M340 61 L421 61 L443 83 L443 274 L421 296 L340 296 L318 274 L318 83 Z" fill="#FF9500" stroke="#000000" strokeWidth="8" strokeLinejoin="miter" strokeMiterlimit="8" />
        <path d="M552 14 L650 14 L768 262 L768 58 L735 58 L735 14 L846 14 L846 58 L818 58 L818 341 L750 341 L630 72 L630 298 L664 298 L664 341 L552 341 L552 298 L586 298 L586 58 L552 58 Z" fill="#FFD60A" stroke="#000000" strokeWidth="8" strokeLinejoin="miter" strokeMiterlimit="8" />
        <path fillRule="evenodd" d="M904 14 L1092 14 L1142 64 L1142 292 L1092 341 L904 341 L904 298 L938 298 L938 58 L904 58 Z M982 61 L1072 61 L1094 83 L1094 274 L1072 296 L982 296 Z" fill="#2EE66B" stroke="#000000" strokeWidth="8" strokeLinejoin="miter" strokeMiterlimit="8" />
        <path d="M1198 14 L1302 14 L1302 58 L1272 58 L1272 274 L1294 296 L1372 296 L1394 274 L1394 58 L1358 58 L1358 14 L1466 14 L1466 58 L1440 58 L1440 292 L1392 341 L1274 341 L1228 292 L1228 58 L1198 58 Z" fill="#00D1FF" stroke="#000000" strokeWidth="8" strokeLinejoin="miter" strokeMiterlimit="8" />
        <path d="M1518 14 L1640 14 L1640 58 L1600 58 L1600 298 L1640 298 L1640 341 L1518 341 L1518 298 L1558 298 L1558 58 L1518 58 Z" fill="#A855F7" stroke="#000000" strokeWidth="8" strokeLinejoin="miter" strokeMiterlimit="8" />
        <path d="M1672 14 L1916 14 L1916 104 L1868 104 L1868 58 L1814 58 L1814 298 L1860 298 L1860 341 L1724 341 L1724 298 L1772 298 L1772 58 L1712 58 L1712 104 L1672 104 Z" fill="#FF2D9B" stroke="#000000" strokeWidth="8" strokeLinejoin="miter" strokeMiterlimit="8" />
      </g>
    </svg>
  );
}

export function ConduitMark({ className, ...props }: ComponentPropsWithoutRef<"svg">) {
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label="CONDUIT"
      focusable="false"
      className={className}
      {...props}
    >
      <circle cx="50" cy="50" r="49.5" fill="#FF3B30" stroke="#000" strokeWidth="1" />
      <circle cx="50" cy="50" r="43.25" fill="#FF9500" />
      <circle cx="50" cy="50" r="37" fill="#FFD60A" />
      <circle cx="50" cy="50" r="30.75" fill="#2EE66B" />
      <circle cx="50" cy="50" r="24.5" fill="#00D1FF" />
      <circle cx="50" cy="50" r="18.25" fill="#A855F7" />
      <circle cx="50" cy="50" r="13" fill="#FF2D9B" />
      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily='"Archivo Black", "Arial Black", "Helvetica Neue", Arial, sans-serif'
        fontSize="32.5"
        fontWeight="900"
        fill="#FFFFFF"
      >
        C
      </text>
    </svg>
  );
}
