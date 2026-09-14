import { PageHeader } from '@/components/layout/page-header';
import { PosScreen } from '@/features/pos/pos-screen';

export default function PosPage() {
  return (
    <div>
      <PageHeader title="Point of sale" subtitle="Scanner types into search and sends Enter. Field refocuses after each sale." />
      <PosScreen />
    </div>
  );
}
