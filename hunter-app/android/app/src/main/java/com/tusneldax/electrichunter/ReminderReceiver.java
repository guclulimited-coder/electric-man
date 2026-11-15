package com.tusneldax.electrichunter;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/** Oyuncuyu geri çağıran yerel bildirim (sunucu yok, kişisel veri yok). Oyun her açıldığında yeniden kurulur. */
public class ReminderReceiver extends BroadcastReceiver {
    static final String CH = "reminder";

    @Override public void onReceive(Context ctx, Intent in) {
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CH) == null)
                nm.createNotificationChannel(new NotificationChannel(CH, in.getStringExtra("channel") != null ? in.getStringExtra("channel") : "Hatırlatma", NotificationManager.IMPORTANCE_DEFAULT));
            Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pi = PendingIntent.getActivity(ctx, 7, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CH)
                .setSmallIcon(R.drawable.ic_stat_bolt)
                .setContentTitle(in.getStringExtra("title"))
                .setContentText(in.getStringExtra("text"))
                .setStyle(new NotificationCompat.BigTextStyle().bigText(in.getStringExtra("text")))
                .setAutoCancel(true).setContentIntent(pi);
            NotificationManagerCompat.from(ctx).notify(7, b.build());
        } catch (SecurityException ignored) {} catch (Exception ignored) {}
    }
}
