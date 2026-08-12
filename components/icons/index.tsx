
import React from 'react';

export const Icon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    {...props}
  >
  </svg>
);

export const KTEIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <Icon {...props} strokeWidth={2} viewBox="0 0 24 24" fill="currentColor">
        <path d="M6.53 3.369a1.26 1.26 0 0 0-1.06.07C2.96 5.099 2.13 8.35 2.13 12c0 3.65.83 6.901 3.34 8.561.43.27.96.3 1.42.06 1.05-.56 2.04-1.29 2.94-2.19a.25.25 0 0 0-.17-.43c-1.35-.3-2.67-.78-3.92-1.43-.53-.28-.73-.91-.45-1.44 1.35-2.52 2.35-5.22 2.91-8.02a.25.25 0 0 0-.23-.27c-.45-.04-.9-.06-1.35-.06zM20.59 4.41c-1.02-.33-2.07-.55-3.14-.68a.25.25 0 0 0-.25.21c-.48 2.37-1.3 4.67-2.4 6.82-.2.39-.02.88.38 1.08.7.35 1.43.64 2.18.86a.25.25 0 0 0 .3-.16c1.3-3.16 2.12-6.49 2.4-9.86a.25.25 0 0 0-.47-.27zM14.7 13.13c-.88.9-1.87 1.63-2.92 2.19.46.24.99.21 1.42-.06C16.04 13.59 18.91 7.42 18.91 7.42a.25.25 0 0 0-.36-.36S12.78 10.98 11.2 12.56c-.23.23-.23.61 0 .85l2.82 2.82c.24.24.62.24.85 0l-.17-.1z" />
    </Icon>
);


export const PlusCircleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <Icon {...props} strokeWidth={2} >
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </Icon>
);


export const ListIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <Icon {...props} strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </Icon>
);

export const TrashIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <Icon {...props} strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </Icon>
);

export const SparklesIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <Icon {...props} strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </Icon>
);

export const TerminalIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <Icon {...props} strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
    </Icon>
);

export const ChevronDownIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <Icon {...props} strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </Icon>
);

export const PlayIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <Icon {...props} strokeWidth={1.5} fill="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
  </Icon>
);

export const StopIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <Icon {...props} strokeWidth={1.5} fill="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9z" />
    </Icon>
);

export const CogIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <Icon {...props} strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </Icon>
);

export const PencilIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <Icon {...props} strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" />
    </Icon>
);

export const UploadIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <Icon {...props} strokeWidth={1.5} >
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  </Icon>
);

export const VideoCameraIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <Icon {...props} strokeWidth={1.5} fill="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9A2.25 2.25 0 0 0 13.5 5.25h-9A2.25 2.25 0 0 0 2.25 7.5v9A2.25 2.25 0 0 0 4.5 18.75Z" />
  </Icon>
);

export const FilmIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <Icon {...props} strokeWidth={1.5} fill="none" stroke="currentColor">
     <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75v3.75a1.5 1.5 0 0 0 1.5 1.5h16.5a1.5 1.5 0 0 0 1.5-1.5v-3.75m-19.5-9v3.75m19.5-3.75v3.75m-19.5 0h.008v.007H2.25v-.007Zm1.5 0h.008v.007H3.75v-.007Zm1.5 0h.008v.007H5.25v-.007Zm1.5 0h.008v.007H6.75v-.007Zm1.5 0h.008v.007H8.25v-.007Zm1.5 0h.008v.007H9.75v-.007Zm1.5 0h.008v.007H11.25v-.007Zm1.5 0h.008v.007H12.75v-.007Zm1.5 0h.008v.007H14.25v-.007Zm1.5 0h.008v.007H15.75v-.007Zm1.5 0h.008v.007H17.25v-.007Zm1.5 0h.008v.007H18.75v-.007Zm1.5 0h.008v.007H20.25v-.007Zm-18 3.75h.008v.007H2.25v-.007Zm1.5 0h.008v.007H3.75v-.007Zm1.5 0h.008v.007H5.25v-.007Zm1.5 0h.008v.007H6.75v-.007Zm1.5 0h.008v.007H8.25v-.007Zm1.5 0h.008v.007H9.75v-.007Zm1.5 0h.008v.007H11.25v-.007Zm1.5 0h.008v.007H12.75v-.007Zm1.5 0h.008v.007H14.25v-.007Zm1.5 0h.008v.007H15.75v-.007Zm1.5 0h.008v.007H17.25v-.007Zm1.5 0h.008v.007H18.75v-.007Zm1.5 0h.008v.007H20.25v-.007Z" />
  </Icon>
);

export const GlobeAltIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <Icon {...props} strokeWidth={1.5} fill="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 0 1-9-9 9 9 0 0 1 9-9m9 9a9 9 0 0 1-9 9m-9-9h18m-4.5-4.5a.75.75 0 0 0 0 1.5 4.5 4.5 0 0 1 0 6 .75.75 0 0 0 0 1.5 6 6 0 1 0-12 0 .75.75 0 0 0 0-1.5 4.5 4.5 0 0 1 0-6 .75.75 0 0 0 0-1.5 6 6 0 1 0 12 0Z" />
  </Icon>
);

export const ServerIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <Icon {...props} strokeWidth={1.5} fill="none" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 17.25v-.228a4.5 4.5 0 0 0-.12-1.03l-2.268-9.64a3.375 3.375 0 0 0-3.285-2.65H8.228a3.375 3.375 0 0 0-3.285 2.65l-2.268 9.64a4.5 4.5 0 0 0-.12 1.03v.228m19.5 0a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3m19.5 0a3 3 0 0 0-3-3H5.25a3 3 0 0 0-3 3m16.5 0h.008v.008h-.008v-.008Z" />
  </Icon>
);

export const CheckCircleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <Icon {...props} strokeWidth={1.5} fill="currentColor" >
     <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </Icon>
);

export const SpeakerWaveIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <Icon {...props} strokeWidth={1.5} fill="none" stroke="currentColor" >
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
  </Icon>
);

export const AdjustmentsHorizontalIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <Icon {...props} strokeWidth={1.5} fill="none" stroke="currentColor" >
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
  </Icon>
);
