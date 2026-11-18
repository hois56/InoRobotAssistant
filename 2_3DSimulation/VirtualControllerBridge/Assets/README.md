# Bridge application icon

`bridge.png` is the generated source image. `bridge.ico` contains transparent,
32-bit PNG frames at 16, 20, 24, 32, 40, 48, 64, 128 and 256 pixels for Windows
Explorer, the taskbar, the notification area and the bridge window. The robot
fills the icon canvas so it remains readable in small taskbar and tray slots.
The project embeds the ICO in the executable and as an application resource;
no external image file is needed to run the published bridge. The window uses
the 64-pixel resource and the tray uses the system's small-icon size.

Created with the built-in imagegen tool using this final prompt:

```text
Use case: logo-brand. Create one production-ready Windows taskbar and notification tray icon: a bold industrial ROBOT ARM with gripper above two interlocking cyan chain links at its base. White arm with cobalt-blue circular joints and base, cyan links. No lettering, no background tile. Genuine completely transparent background. Simple flat vector-like illustration with smooth continuous clean boundaries, flat solid color fills and absolutely NO texture or speckles. A unified compact emblem occupying 96% of the square canvas, almost full bleed with only 2% transparent margin. Three large round joints, two thick diagonal/straight arm segments, simple gripper at right. Exactly two thick interlocking links at lower center. Excellent readability at 16px and 32px. Bright white outline separates the blue base from dark desktop backgrounds. No shadows, no bevels, no photographic effect, no sketch strokes, no random dots, no gradients, no detached fragments, no logos, no watermark. Every opaque pixel belongs to the continuous main icon. Clean smooth vector-style silhouette.
```
