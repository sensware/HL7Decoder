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
// Files are read off the main thread so large batches don't freeze the window. The encoding is taken
// from a byte-order mark when there is one (UTF-8, UTF-16 or UTF-32), then UTF-8, then Latin-1 (common
// for HL7 feeds, and able to read any bytes).
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
    NSArray<NSURL *> *urls = panel.URLs;
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
      NSMutableArray *files = [NSMutableArray array];
      for (NSURL *url in urls) {
        NSError *error = nil;
        NSString *text = [HL7MacBridge readText:url error:&error];
        if (!text) {
          reject(@"read", [NSString stringWithFormat:@"Could not read %@.", url.lastPathComponent], error);
          return;
        }
        [files addObject:@{ @"name": url.lastPathComponent, @"text": text }];
      }
      resolve(files);
    });
  }];
}

+ (NSString *)readText:(NSURL *)url error:(NSError **)error
{
  NSData *data = [NSData dataWithContentsOfURL:url options:0 error:error];
  if (!data) return nil;
  const uint8_t *b = data.bytes;
  NSUInteger n = data.length;
  NSStringEncoding bom = 0;
  NSUInteger skip = 0;
  if (n >= 3 && b[0] == 0xEF && b[1] == 0xBB && b[2] == 0xBF) { bom = NSUTF8StringEncoding; skip = 3; }
  else if (n >= 4 && b[0] == 0xFF && b[1] == 0xFE && b[2] == 0 && b[3] == 0) { bom = NSUTF32LittleEndianStringEncoding; skip = 4; }
  else if (n >= 4 && b[0] == 0 && b[1] == 0 && b[2] == 0xFE && b[3] == 0xFF) { bom = NSUTF32BigEndianStringEncoding; skip = 4; }
  else if (n >= 2 && b[0] == 0xFF && b[1] == 0xFE) { bom = NSUTF16LittleEndianStringEncoding; skip = 2; }
  else if (n >= 2 && b[0] == 0xFE && b[1] == 0xFF) { bom = NSUTF16BigEndianStringEncoding; skip = 2; }
  if (bom) {
    NSString *text = [[NSString alloc] initWithData:[data subdataWithRange:NSMakeRange(skip, n - skip)] encoding:bom];
    if (text) return text;
  }
  return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding]
      ?: [[NSString alloc] initWithData:data encoding:NSISOLatin1StringEncoding];
}

@end
