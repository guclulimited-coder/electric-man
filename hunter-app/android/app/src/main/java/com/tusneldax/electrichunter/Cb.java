package com.tusneldax.electrichunter;

/** Result callback for bridge actions: error code or a JSON-compatible value. */
public interface Cb {
    void done(String error, Object data);
}
