# Local game server. Serves this project and writes island-map.json
# when build mode saves. No extra installs.
# Stop it with Ctrl+C.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$port = 8080
if ($args.Count -ge 1) { $port = [int]$args[0] }

if (-not (Test-Path -LiteralPath (Join-Path $root "index.html"))) {
  Write-Error "Could not find index.html next to the tools folder."
  exit 1
}

if (-not ([System.Management.Automation.PSTypeName]"DrugsSurvival.DevServer").Type) {
  $code = @'
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace DrugsSurvival {
  public static class DevServer {
    const int MaxBytes = 8 * 1024 * 1024;
    static readonly object WriteLock = new object();
    static readonly UTF8Encoding Utf8 = new UTF8Encoding(false, true);
    static readonly Dictionary<string, string> Types = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) {
      { ".html", "text/html; charset=utf-8" },
      { ".js", "text/javascript; charset=utf-8" },
      { ".mjs", "text/javascript; charset=utf-8" },
      { ".css", "text/css; charset=utf-8" },
      { ".json", "application/json; charset=utf-8" },
      { ".png", "image/png" },
      { ".jpg", "image/jpeg" },
      { ".jpeg", "image/jpeg" },
      { ".gif", "image/gif" },
      { ".webp", "image/webp" },
      { ".svg", "image/svg+xml" },
      { ".glb", "model/gltf-binary" },
      { ".gltf", "model/gltf+json" },
      { ".bin", "application/octet-stream" },
      { ".wasm", "application/wasm" },
      { ".ogg", "audio/ogg" },
      { ".mp3", "audio/mpeg" },
      { ".wav", "audio/wav" }
    };

    public static void Run(string root, int port) {
      string gameRoot = Path.GetFullPath(root);
      HttpListener listener = new HttpListener();
      listener.Prefixes.Add("http://127.0.0.1:" + port + "/");
      listener.Prefixes.Add("http://localhost:" + port + "/");
      try {
        listener.Start();
      } catch (HttpListenerException ex) {
        Console.Error.WriteLine("Could not listen on port " + port + ". " + ex.Message);
        Environment.Exit(1);
      }
      Console.WriteLine("Drugs Survival local server");
      Console.WriteLine("Open http://localhost:" + port + "/");
      Console.WriteLine("Build mode writes island-map.json in the game folder.");
      Console.WriteLine("Press Ctrl+C to stop.");
      Console.CancelKeyPress += delegate(object sender, ConsoleCancelEventArgs e) {
        e.Cancel = true;
        listener.Stop();
      };
      try {
        while (listener.IsListening) {
          HttpListenerContext context = listener.GetContext();
          ThreadPool.QueueUserWorkItem(delegate(object state) {
            Handle((HttpListenerContext)state, gameRoot);
          }, context);
        }
      } catch (HttpListenerException) {
        // Stopped with Ctrl+C.
      } catch (ObjectDisposedException) {
        // Listener already closed.
      }
    }

    static void Handle(HttpListenerContext context, string root) {
      try {
        string method = context.Request.HttpMethod;
        string path = Uri.UnescapeDataString(context.Request.Url.AbsolutePath);
        if (method == "POST") {
          SaveMap(context, root, path);
          return;
        }
        if (method != "GET" && method != "HEAD") {
          Send(context, 405, "Method not allowed");
          return;
        }
        SendFile(context, root, path, method == "HEAD");
      } catch (Exception ex) {
        try {
          Console.Error.WriteLine(ex.Message);
          Send(context, 500, "Server error");
        } catch (Exception) {
          // The browser already went away.
        }
      }
    }

    static void SaveMap(HttpListenerContext context, string root, string path) {
      if (path != "/island-map.json") {
        Send(context, 404, "Not found");
        return;
      }
      if (!IsLocal(context.Request)) {
        Send(context, 403, "Saves are only accepted from this computer.");
        return;
      }
      long length = context.Request.ContentLength64;
      if (length < 2 || length > MaxBytes) {
        Send(context, 400, "Save was empty or too large.");
        return;
      }
      byte[] bytes = ReadBody(context.Request.InputStream, (int)length);
      if (bytes == null) {
        Send(context, 400, "Save could not be read.");
        return;
      }
      string text;
      try {
        text = Utf8.GetString(bytes);
      } catch (DecoderFallbackException) {
        Send(context, 400, "Save was not valid text.");
        return;
      }
      string error = ValidateMap(text, Path.Combine(root, "island-map.json"));
      if (error != null) {
        Send(context, 400, error);
        return;
      }
      string dest = Path.Combine(root, "island-map.json");
      string temp = dest + ".tmp";
      lock (WriteLock) {
        File.WriteAllBytes(temp, bytes);
        try {
          if (File.Exists(dest)) File.Replace(temp, dest, null);
          else File.Move(temp, dest);
        } catch (Exception) {
          if (File.Exists(temp)) File.Delete(temp);
          throw;
        }
      }
      Console.WriteLine("Saved island-map.json");
      context.Response.StatusCode = 204;
      context.Response.ContentLength64 = 0;
      context.Response.OutputStream.Close();
    }

    static bool IsLocal(HttpListenerRequest request) {
      string host = request.Url.Host;
      return host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "[::1]";
    }

    static byte[] ReadBody(Stream stream, int length) {
      byte[] bytes = new byte[length];
      int read = 0;
      while (read < length) {
        int count = stream.Read(bytes, read, length - read);
        if (count <= 0) return null;
        read += count;
      }
      return bytes;
    }

    static string ValidateMap(string text, string currentPath) {
      JavaScriptSerializer serializer = new JavaScriptSerializer();
      serializer.MaxJsonLength = MaxBytes;
      object parsed;
      try {
        parsed = serializer.DeserializeObject(text);
      } catch (Exception) {
        return "Save was not valid JSON.";
      }
      Dictionary<string, object> root = parsed as Dictionary<string, object>;
      if (root == null || !root.ContainsKey("pieces")) return "Save needs a pieces list.";
      IList pieces = root["pieces"] as IList;
      if (pieces == null) return "Save needs a pieces list.";
      if (root.ContainsKey("removedRoads") && !(root["removedRoads"] is IList)) {
        return "removedRoads must be a list.";
      }
      if (root.ContainsKey("zoneBuildings") && !(root["zoneBuildings"] is IList)) {
        return "zoneBuildings must be a list.";
      }
      foreach (object item in pieces) {
        Dictionary<string, object> piece = item as Dictionary<string, object>;
        if (piece == null) return "A piece was not an object.";
        if (!(piece.ContainsKey("kit") && piece["kit"] is string)) return "A piece is missing kit.";
        if (!(piece.ContainsKey("file") && piece["file"] is string)) return "A piece is missing file.";
        if (!IsNumber(piece, "x") || !IsNumber(piece, "z") || !IsWhole(piece, "turn")) {
          return "A piece has a bad position or turn.";
        }
      }
      if (pieces.Count == 0 && File.Exists(currentPath)) {
        string current = File.ReadAllText(currentPath);
        object currentParsed;
        try {
          currentParsed = serializer.DeserializeObject(current);
        } catch (Exception) {
          currentParsed = null;
        }
        Dictionary<string, object> currentRoot = currentParsed as Dictionary<string, object>;
        IList currentPieces = currentRoot == null ? null : currentRoot["pieces"] as IList;
        if (currentPieces != null && currentPieces.Count > 0) return "Refused an empty map save.";
      }
      return null;
    }

    static bool IsNumber(Dictionary<string, object> piece, string key) {
      if (!piece.ContainsKey(key)) return false;
      return piece[key] is byte || piece[key] is short || piece[key] is int
        || piece[key] is long || piece[key] is float || piece[key] is double || piece[key] is decimal;
    }

    static bool IsWhole(Dictionary<string, object> piece, string key) {
      if (!IsNumber(piece, key)) return false;
      double value = Convert.ToDouble(piece[key]);
      return !double.IsNaN(value) && !double.IsInfinity(value) && Math.Abs(value - Math.Round(value)) < 0.000001;
    }

    static void SendFile(HttpListenerContext context, string root, string path, bool head) {
      if (path.IndexOf('\\') >= 0) {
        Send(context, 400, "Bad path");
        return;
      }
      string relative = path == "/" ? "index.html" : path.TrimStart('/');
      if (relative.Length == 0 || relative.IndexOf("..", StringComparison.Ordinal) >= 0) {
        Send(context, 400, "Bad path");
        return;
      }
      string full = Path.GetFullPath(Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar)));
      string rootFull = Path.GetFullPath(root);
      if (!rootFull.EndsWith(Path.DirectorySeparatorChar.ToString())) {
        rootFull = rootFull + Path.DirectorySeparatorChar;
      }
      if (!full.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase)) {
        Send(context, 403, "Forbidden");
        return;
      }
      if (!File.Exists(full)) {
        Send(context, 404, "Not found");
        return;
      }
      string extension = Path.GetExtension(full);
      string type;
      if (!Types.TryGetValue(extension, out type)) type = "application/octet-stream";
      context.Response.StatusCode = 200;
      context.Response.ContentType = type;
      if (extension.Equals(".json", StringComparison.OrdinalIgnoreCase)) {
        context.Response.Headers["Cache-Control"] = "no-cache";
      }
      if (head) {
        context.Response.ContentLength64 = new FileInfo(full).Length;
        context.Response.OutputStream.Close();
        return;
      }
      using (FileStream file = File.Open(full, FileMode.Open, FileAccess.Read, FileShare.ReadWrite)) {
        context.Response.ContentLength64 = file.Length;
        file.CopyTo(context.Response.OutputStream);
      }
      context.Response.OutputStream.Close();
    }

    static void Send(HttpListenerContext context, int status, string message) {
      byte[] bytes = Encoding.UTF8.GetBytes(message);
      context.Response.StatusCode = status;
      context.Response.ContentType = "text/plain; charset=utf-8";
      context.Response.ContentLength64 = bytes.Length;
      context.Response.OutputStream.Write(bytes, 0, bytes.Length);
      context.Response.OutputStream.Close();
    }
  }
}
'@
  Add-Type -TypeDefinition $code -ReferencedAssemblies "System.Web.Extensions" -Language CSharp
}

[DrugsSurvival.DevServer]::Run($root, $port)
