import webpush from 'web-push';
import 'dotenv/config';

const configureWebpush = () => {
  webpush.setVapidDetails(
    'mailto:eddymuchiri123@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
};

export default configureWebpush;