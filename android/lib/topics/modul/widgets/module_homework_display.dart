import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_html/flutter_html.dart';
import 'package:lectio_wrapper/types/events/calendar_event_details.dart' as ce;
import 'package:betterlectio/logic/student/student_bloc.dart';
import 'package:betterlectio/topics/modul/screens/modul_lektie_screen.dart';
import 'package:betterlectio/topics/state/empty.dart';
import 'package:betterlectio/utils/ad_route.dart';

class ModuleHomeworkDisplay extends StatelessWidget {
  const ModuleHomeworkDisplay({super.key, required this.details});
  final ce.RegularCalendarEventDetails details;
  @override
  Widget build(BuildContext context) {
    if (details.htmlContent.isEmpty) {
      return const EmptyScreen();
    }
    return SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 8.0),
        child: BlHtml(content: details.htmlContent));
  }
}

class BlHtml extends StatelessWidget {
  const BlHtml({super.key, required this.content});
  final String content;
  @override
  Widget build(BuildContext context) {
    return Html(
      style: {
        "span.bb_b": Style(fontWeight: FontWeight.bold),
        "span.bb_i": Style(fontStyle: FontStyle.italic),
        "span.bb_u": Style(textDecoration: TextDecoration.underline),
        "h1": Style(fontSize: FontSize.large),
        "a": Style(textDecoration: TextDecoration.none),
        "hr": Style(display: Display.none),
        ".ls-paper-section-heading": Style(
            fontWeight: FontWeight.w500,
            fontSize: FontSize(
                Theme.of(context).textTheme.titleSmall?.fontSize ?? 0.0),
            color: Theme.of(context).colorScheme.primary)
      },
      data: content,
      onLinkTap: (url, attributes, element) {
        if (url != null) {
          Navigator.push(
              context,
              adRoute(
                  ModulLektieScreen(
                      content: FileDetails(element?.text.trim() ?? "", url)),
                  onlyFromEdge: true));
        }
      },
      extensions: [
        TagExtension(
          tagsToExtend: {"img"},
          builder: (ctx) {
            var student = context.read<StudentBloc>().state.student;
            var src = ctx.attributes['src'];
            if (src != null) {
              return Image(
                image: student!.getImage(ctx.attributes['src'] ?? ""),
              );
            }
            return Container();
          },
        )
      ],
    );
  }
}
