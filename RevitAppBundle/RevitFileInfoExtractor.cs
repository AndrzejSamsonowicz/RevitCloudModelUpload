using System;
using System.Collections.Generic;
using System.IO;
using Autodesk.Revit.ApplicationServices;
using Autodesk.Revit.DB;
using DesignAutomationFramework;
using Newtonsoft.Json;

namespace RevitFileInfoExtractor
{
    [Autodesk.Revit.Attributes.Regeneration(Autodesk.Revit.Attributes.RegenerationOption.Manual)]
    [Autodesk.Revit.Attributes.Transaction(Autodesk.Revit.Attributes.TransactionMode.Manual)]
    public class RevitFileInfoExtractorApp : IExternalDBApplication
    {
        public ExternalDBApplicationResult OnStartup(ControlledApplication app)
        {
            DesignAutomationBridge.DesignAutomationReadyEvent += HandleDesignAutomationReadyEvent;
            return ExternalDBApplicationResult.Succeeded;
        }

        private void HandleDesignAutomationReadyEvent(object sender, DesignAutomationReadyEventArgs e)
        {
            e.Succeeded = ExtractFileInfo(e.DesignAutomationData);
        }

        private bool ExtractFileInfo(DesignAutomationData data)
        {
            if (data == null) return false;

            Application app = data.RevitApp;
            if (app == null) return false;

            string modelPath = data.FilePath;
            if (string.IsNullOrWhiteSpace(modelPath))
            {
                Console.WriteLine("Error: Model path is null or empty.");
                return false;
            }

            try
            {
                Console.WriteLine($"Extracting file info from: {modelPath}");

                // Use BasicFileInfo to extract information without opening the file
                BasicFileInfo fileInfo = BasicFileInfo.Extract(modelPath);

                if (fileInfo == null || !fileInfo.IsValidObject)
                {
                    Console.WriteLine("Error: Could not extract file info or file is invalid.");
                    return false;
                }

                // Create result object
                var result = new
                {
                    filename = Path.GetFileName(modelPath),
                    format = fileInfo.Format,  // THIS IS THE REVIT VERSION (e.g., "2022", "2024")
                    isWorkshared = fileInfo.IsWorkshared,
                    isCentral = fileInfo.IsCentral,
                    isLocal = fileInfo.IsLocal,
                    username = fileInfo.Username,
                    centralPath = fileInfo.CentralPath,
                    allLocalChangesSavedToCentral = fileInfo.AllLocalChangesSavedToCentral,
                    isSavedInCurrentVersion = fileInfo.IsSavedInCurrentVersion,
                    isSavedInLaterVersion = fileInfo.IsSavedInLaterVersion,
                    languageWhenSaved = (int)fileInfo.LanguageWhenSaved,
                    isCreatedLocal = fileInfo.IsCreatedLocal,
                    isInProgress = fileInfo.IsInProgress
                };

                // Serialize to JSON
                string json = JsonConvert.SerializeObject(result, Formatting.Indented);
                Console.WriteLine("File Info Result:");
                Console.WriteLine(json);

                // Write result to output file
                using (StreamWriter writer = File.CreateText("result.json"))
                {
                    writer.Write(json);
                    writer.Flush();
                }

                Console.WriteLine("File info extracted successfully!");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Exception occurred: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                return false;
            }
        }

        public ExternalDBApplicationResult OnShutdown(ControlledApplication app)
        {
            return ExternalDBApplicationResult.Succeeded;
        }
    }
}
