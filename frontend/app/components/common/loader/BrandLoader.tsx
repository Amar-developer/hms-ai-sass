type BrandLoaderProps = {
  label?: string;
  fullScreen?: boolean;
};

export const BRAND_LOADER_CYCLE_MS = 2250;

export function BrandLoader({
  label = "Loading MedizinHub HMS",
  fullScreen = true,
}: BrandLoaderProps) {
  return (
    <div
      className={
        fullScreen
          ? "grid min-h-screen w-full place-items-center bg-white"
          : "grid min-h-40 w-full place-items-center bg-white"
      }
      role="status"
      aria-label={label}
    >
      <div className="grid h-28 w-36 place-items-center">
        <svg
          aria-hidden="true"
          viewBox="0 0 53 35"
          fill="none"
          className="brand-loader-logo h-[70px] w-[106px] overflow-visible"
        >
          <path
            pathLength="1"
            d="M14.0865 15.001C16.1874 15.6324 18.9762 15.7107 20.7549 14.239C21.752 13.4139 22.3333 12.1599 22.5118 10.8798C22.6903 9.59966 22.4901 8.28906 22.1265 7.04812C21.604 5.26509 20.7179 3.42328 19.3681 2.11485C18.6431 1.41383 17.6961 0.889154 16.6881 0.871737C14.8811 0.836904 13.5967 2.22153 12.7084 3.63663C11.5067 5.54811 10.3223 7.47048 9.15542 9.40373C6.82158 13.2702 4.55741 17.1781 2.36291 21.1251C1.31356 23.0148 0.508038 25.2747 1.03925 27.4452C1.41806 28.9888 2.27148 30.3995 3.41227 31.5076C4.94711 32.9989 6.97616 33.8415 9.13582 33.6477C14.4 33.1753 17.3434 27.1339 20.1061 23.004"
            stroke="url(#brand-loader-blue)"
            strokeWidth="1.74167"
            strokeLinecap="round"
            className="brand-loader-stroke brand-loader-stroke-left"
          />
          <path
            pathLength="1"
            d="M38.0257 11.7854C35.8029 10.8145 31.9016 9.67148 30.062 14.7049C29.8943 15.493 29.8094 17.5438 30.8087 19.4488C32.0758 21.8631 33.3798 24.2499 34.734 26.6266C35.971 28.7976 37.144 30.6477 39.1926 31.9496C41.25 33.2558 43.8298 33.8131 46.205 33.2493C48.5824 32.6854 50.6898 30.9416 51.4714 28.6491C53.0237 24.0881 49.7014 19.7623 47.5526 16.0351C46.1375 13.5815 44.7224 11.1258 43.3073 8.67219C42.3342 6.98278 41.3588 5.29336 40.3857 3.60394C39.5432 2.14094 37.7231 0.56909 35.8661 1.00233C34.8341 1.24181 34.0134 2.00162 33.345 2.75054C33.345 2.75054 31.7122 4.81877 30.8087 6.11848"
            stroke="url(#brand-loader-green)"
            strokeWidth="1.74167"
            strokeLinecap="round"
            className="brand-loader-stroke brand-loader-stroke-right"
          />
          <g className="brand-loader-details">
            <path
              d="M13.4488 16.5968C14.5057 16.5968 15.3625 15.7401 15.3625 14.6832C15.3625 13.6263 14.5057 12.7695 13.4488 12.7695C12.3919 12.7695 11.5352 13.6263 11.5352 14.6832C11.5352 15.7401 12.3919 16.5968 13.4488 16.5968Z"
              fill="#02A0D8"
            />
            <path
              d="M38.524 14.089C39.5809 14.089 40.4377 13.2323 40.4377 12.1754C40.4377 11.1185 39.5809 10.2617 38.524 10.2617C37.4671 10.2617 36.6104 11.1185 36.6104 12.1754C36.6104 13.2323 37.4671 14.089 38.524 14.089Z"
              fill="#03C777"
            />
            <path
              d="M25.8647 10.8361C26.3067 10.1133 27.2494 9.8869 27.9721 10.3289C28.6949 10.7708 28.9213 11.7135 28.4794 12.4363L26.8705 15.0684L24.2559 13.4682L25.8647 10.8361Z"
              fill="#04D17C"
            />
            <path
              d="M23.9143 14.041L26.5138 15.6325L24.8766 18.3081C24.4368 19.0265 23.5007 19.2508 22.7823 18.8132C22.0638 18.3734 21.8396 17.4373 22.2772 16.7188L23.9143 14.0432V14.041Z"
              fill="#018DC2"
            />
          </g>
          <defs>
            <linearGradient
              id="brand-loader-blue"
              x1="11.9029"
              y1="0.760706"
              x2="11.5546"
              y2="33.8502"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#03C2FE" />
              <stop offset="1" stopColor="#0175A7" />
            </linearGradient>
            <linearGradient
              id="brand-loader-green"
              x1="41.1237"
              y1="1.04805"
              x2="40.7841"
              y2="33.4409"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#05DA80" />
              <stop offset="1" stopColor="#009F66" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
