import Verify from './Verify';
import Vote from './Vote';
import { useAuth } from '../state/auth';

export default function VoterPortal() {
  const { voterToken } = useAuth();

  return voterToken ? <Vote /> : <Verify />;
}
