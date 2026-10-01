using System;
using System.Drawing;
using System.IO;
using System.Text;
using System.Windows.Forms;

public class ComputerUseFixture {
  [STAThread]
  public static void Main(string[] args) {
    Application.EnableVisualStyles();
    var form = new Form { Text = args[0], ClientSize = new Size(520, 230), StartPosition = FormStartPosition.CenterScreen };
    var input = new TextBox { AccessibleName = "Test input", Location = new Point(30, 40), Size = new Size(450, 30) };
    var button = new Button { Text = "Verify input", Location = new Point(30, 100), Size = new Size(180, 40) };
    var label = new Label { Text = "Waiting for input", Location = new Point(30, 160), Size = new Size(450, 30) };
    button.Click += (sender, e) => {
      label.Text = "Verified: " + input.Text;
      File.WriteAllText(args[1], input.Text, new UTF8Encoding(false));
    };
    form.Controls.AddRange(new Control[] { input, button, label });
    var timer = new Timer { Interval = 300 };
    timer.Tick += (sender, e) => { if (File.Exists(args[2])) { timer.Stop(); form.Close(); } };
    timer.Start();
    form.Shown += (sender, e) => { input.Focus(); };
    Application.Run(form);
    timer.Dispose(); form.Dispose();
  }
}
