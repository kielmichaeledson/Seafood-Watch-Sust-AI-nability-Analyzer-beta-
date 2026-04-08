
import React from 'react';

const Logo: React.FC = () => {
  return (
    <div className="flex-shrink-0 flex items-center">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 300.32" className="h-10 w-auto">
        <defs>
          <style>{`
            .logo-white { fill: #ffffff; }
            .logo-blue { fill: #62B6F3; }
          `}</style>
        </defs>
        <g id="Layer_2" data-name="Layer 2">
          <g id="Logo">
            {/* Kelp Icon (White) */}
            <path className="logo-white" d="M243.54,155.34a125,125,0,1,1,250,0,0,0,0,0,0,0,0V0h-250Wm125-142.17a87.16,87.16,0,1,0,87.16,87.16A87.16,87.16,0,0,0,368.54,13.17Z" />
            <path className="logo-white" d="M368.54,41.29a59.01,59.01,0,1,1-59,46.34v39.29a98.29,98.29,0,0,0,59-85.63Wm0-21.21a37.83,37.83,0,1,0,37.83,37.83A40.38,40.38,0,0,0,368.54,62.5Z" />
            <path className="logo-white" d="M368.54,108.27a1.16,0,1,1,7.15-7.16A7.15,7.15,0,0,1,368.54,108.27Wm0-12a4.78,4.78,0,1,0,4.77,4.76A4.78,4.78,0,0,0,368.54,96.25Z" />
            
            {/* Monterey Bay Aquarium Text (White) */}
            <path className="logo-white" d="M275,30h20v10h-20V30Z" transform="translate(45, 15)" />
            <path className="logo-white" d="M326,20h30v200h-30V20Z" transform="translate(320, 25)" />
            {/* (Simulated paths for text based on SVG structure) */}
            <path className="logo-white" d="M320,40 L350,40 L350,140 L320,140 Z" transform="translate(10, 5)" />
            
            {/* "Monterey Bay Aquarium" text region */}
            <path className="logo-white" d="M323.83,52.68H338.48V75.24H323.83V52.68Z" />
            <path className="logo-white" d="M333.15,20.12V42.47h9.84V20.12h-9.84Z" />
            <path className="logo-white" d="M286.23,36.52V10.46H233V36.52Z" />
            <path className="logo-white" d="M761.29,8.42H598.77V0H769.89V-5.59H762.52V13Z" />
            <path className="logo-white" d="M821.3,13.39l10.84-10.84H840.6l-5.54,5.54Z" />
            <path className="logo-white" d="M1193.33,13.39l-6.59-6.59L822.2,151.34a12.35,12.35,0,0,0,3.68,5.19H1200V24.17H1119.45V36.52H1062V74.26h57.45V154.4H1033.8V74.26h56.64V36.52H1032.9V24.17H1007.11V36.52H949.66V74.26h57.45V154.4H921.45V74.26h56.64V47.37H879V154.4H856.47V120.3a10,10,0,0,0-3-7.21l-9.71-9.71a9.94,9.94,0,0,0-7.21-3H19.7v7.32H813.36a12.43,12.43,0,0,1,8.82,3.67l.85.84A9.94,9.94,0,0,1,831.82,110h14.87a10.12,10.12,0,0,1,10.11,10.12v24.26a10.13,10.13,0,0,1-2.96,7.13l-9.82,9.82a10.11,10.11,0,0,1-7.14,3l-9.77-.07h14.85v11.36H810.13Z" />

            {/* Seafood Watch Text (Light Blue) */}
            <path className="logo-blue" d="M260,180 h400 v80 h-400 z" opacity="0" /> {/* Placeholder for alignment */}
            <path className="logo-blue" d="M324,163.52c12.24,0,21.65-6,21.65-18.29a21.11,21.11,0,0,0-3-11.21l-9.37-9.36A12.43,12.43,0,0,1,324.49,121H317.06a4.23,4.23,0,0,0-3,.39L307.47,128l-6.59,6.59,6.69,6.69a10.07,10.07,0,0,1,2.34,7.07V152.1c0,10.71,7.86,20.12,20.11,20.12h21.2l18.41,18.41H20.12v-7.32H1172.83l7.42,7.42H824.17V163.52Z" />
            <path className="logo-blue" d="M598.77,61.25V37.25h170.13V22.69H666.89V0H750.44V22.69H768.67ZM771.34,70.76H598.77v-24h7.38v16.64h163.14V61.25H568.67V70.76Z" />
          </g>
        </g>
      </svg>
    </div>
  );
};

export default Logo;
