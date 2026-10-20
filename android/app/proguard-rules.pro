# Electric Man: uygulama sınıfları ve WebView köprüsü olduğu gibi kalsın; R8 yalnız kütüphaneleri küçültsün.
-keep class com.tusneldax.electricman.** { *; }
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
-dontwarn javax.annotation.**
