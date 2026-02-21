package slack

import "testing"

func TestFixSlackMrkdwn(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "FullwidthColonAfterBold",
			in:   "*住所*：東京",
			want: "*住所*: 東京",
		},
		{
			name: "FullwidthParenAfterBold",
			in:   "*金融ch*（17件）",
			want: "*金融ch* （17件）",
		},
		{
			name: "FullwidthBracketAfterBold",
			in:   "*重要*「注意」",
			want: "*重要* 「注意」",
		},
		{
			name: "FullwidthCommaAfterBold",
			in:   "*項目*、次",
			want: "*項目* 、次",
		},
		{
			name: "AsciiAfterBold_NoChange",
			in:   "*bold* text",
			want: "*bold* text",
		},
		{
			name: "HalfwidthColonAfterBold_NoChange",
			in:   "*label*: value",
			want: "*label*: value",
		},
		{
			name: "MultipleFixesInText",
			in:   "*住所*：東京\n*金額*（100万円）",
			want: "*住所*: 東京\n*金額* （100万円）",
		},
		{
			name: "NonBoldAsterisk_NoChange",
			in:   "5 * 3 = 15：答え",
			want: "5 * 3 = 15：答え",
		},
		{
			name: "DoubleAsteriskToSingle",
			in:   "**太字**テスト",
			want: "*太字* テスト",
		},
		{
			name: "EmptyString",
			in:   "",
			want: "",
		},
		{
			name: "DoubleAsteriskWithFullwidthColon",
			in:   "**見出し**：内容",
			want: "*見出し*: 内容",
		},
		{
			name: "EmojiAfterBold",
			in:   "*結果*🔴失敗",
			want: "*結果* 🔴失敗",
		},
		{
			name: "MultipleBoldsOnSameLine",
			in:   "*A*（1）と*B*（2）",
			want: "*A* （1）と*B* （2）",
		},
		{
			name: "OnlyASCII_NoChange",
			in:   "Hello *world* test",
			want: "Hello *world* test",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := FixSlackMrkdwn(tt.in)
			if got != tt.want {
				t.Errorf("FixSlackMrkdwn(%q)\n got  = %q\n want = %q", tt.in, got, tt.want)
			}
		})
	}
}
