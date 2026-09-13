import type { InformationPageProps } from './InformationPage.js';
import { InformationPage } from './InformationPage.js';
import { InformationLayout } from './InformationLayout.js';

export function ConsultationsPage(props: InformationPageProps) {
  return (
    <InformationLayout title="咨询">
      <InformationPage {...props} view="consultations" />
    </InformationLayout>
  );
}
