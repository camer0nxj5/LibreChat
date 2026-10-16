import React, { memo } from 'react';
import GoogleDriveIcon from './GoogleDriveIcon';
import { CheckboxButton } from '@librechat/client';
import { useBadgeRowContext } from '~/Providers';
import { badgeAccents } from './accents';

function GoogleTools() {
  const context = useBadgeRowContext();
  if (!context) return null;

  const { googleTools, toggleGoogleTools } = context;
  const enabled = googleTools.toggleState === true;

  return (
    true && (
      <CheckboxButton
        checked={enabled}
        setValue={({ value }: { value: boolean | string | number }) =>
          toggleGoogleTools(value === true)
        }
        label="Google Tools"
        isCheckedClassName={badgeAccents.blue}
        icon={<GoogleDriveIcon className="icon-md" aria-hidden="true" />}
      />
    )
  );
}

export default memo(GoogleTools);
