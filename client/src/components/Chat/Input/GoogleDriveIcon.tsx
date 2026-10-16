import React from 'react';

/** Google Drive's brand colors are intentional; this is a logo, not a theme color. */
export default function GoogleDriveIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" focusable="false" {...props}>
      <polygon fill="#0F9D58" points="17,4 3,28 10,40 24,16" />
      <polygon fill="#4285F4" points="10,40 38,40 45,28 17,28" />
      <polygon fill="#F4B400" points="17,4 31,4 45,28 31,28" />
    </svg>
  );
}
