// Native services for the macOS app's JavaScript (src/platform/index.macos.tsx):
// reading and writing the pasteboard, and opening text files with the standard Open panel.
// The app is sandboxed with com.apple.security.files.user-selected.read-only, which lets it read
// whatever the user picks in the panel and nothing else.

#import <AppKit/AppKit.h>
#import <React/RCTBridgeModule.h>

@interface HL7MacBridge : NSObject <RCTBridgeModule>
@end

@implementation HL7MacBridge

RCT_EXPORT_MODULE();

// AppKit objects (NSPasteboard, NSOpenPanel) must be used on the main thread.
- (dispatch_queue_t)methodQueue
{
  return dispatch_get_main_queue();
}

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

RCT_EXPORT_METHOD(getClipboardString:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  NSString *text = [[NSPasteboard generalPasteboard] stringForType:NSPasteboardTypeString];
  resolve(text ?: [NSNull null]);
}

RCT_EXPORT_METHOD(setClipboardString:(NSString *)text resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
  [pasteboard clearContents];
  if ([pasteboard setString:text forType:NSPasteboardTypeString]) {
    resolve([NSNull null]);
  } else {
    reject(@"clipboard", @"Could not write to the clipboard.", nil);
  }
}

// Resolves to [{ name, text }] for the chosen files, or null if the user cancels.
// Files are read as UTF-8, falling back to Latin-1 (common for HL7 feeds) when that fails.
RCT_EXPORT_METHOD(openTextFiles:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  NSOpenPanel *panel = [NSOpenPanel openPanel];
  panel.canChooseFiles = YES;
  panel.canChooseDirectories = NO;
  panel.allowsMultipleSelection = YES;
  panel.message = @"Choose HL7 message files (.hl7, .txt or any plain text).";
  panel.prompt = @"Open";

  [panel beginWithCompletionHandler:^(NSModalResponse response) {
    if (response != NSModalResponseOK) {
      resolve([NSNull null]);
      return;
    }
    NSMutableArray *files = [NSMutableArray array];
    for (NSURL *url in panel.URLs) {
      NSError *error = nil;
      NSString *text = [NSString stringWithContentsOfURL:url encoding:NSUTF8StringEncoding error:&error];
      if (!text) {
        text = [NSString stringWithContentsOfURL:url encoding:NSISOLatin1StringEncoding error:&error];
      }
      if (!text) {
        reject(@"read", [NSString stringWithFormat:@"Could not read %@.", url.lastPathComponent], error);
        return;
      }
      [files addObject:@{ @"name": url.lastPathComponent, @"text": text }];
    }
    resolve(files);
  }];
}

@end
