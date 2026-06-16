import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:betterlectio/l10n/helper.dart';
import 'package:betterlectio/logic/app/typography.dart';
import 'package:betterlectio/logic/student/student_bloc.dart';
import 'package:betterlectio/topics/welcome/widgets/illustration.dart';
import 'package:betterlectio/widgets/layout/padded_column.dart';

class GreetingsScreen extends StatelessWidget {
  const GreetingsScreen({super.key, required this.next});

  final Function() next;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16.0),
      child: Center(
        child: PaddedColumn(
          padding: 24.0,
          children: [
            const Illustration(
              illustration: "accept_request",
            ),
            PaddedColumn(
              padding: 4.0,
              children: [
                Text(
                  context.l10n.welcome_greeting_title
                  ,
                  style: BlTypography.headlineSmall(context),
                  textAlign: TextAlign.center,
                ),
                Text(
                  context.l10n.welcome_greeting_description,
                  style: BlTypography.bodySmall(context),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
            OverflowBar(
                spacing: 8.0,
                alignment: MainAxisAlignment.center,
                children: [
                  FilledButton.tonal(
                      onPressed: () {
                        context.read<StudentBloc>().add(Demologin());
                      },
                      child: const Text("Demo")),
                  FilledButton(onPressed: next, child:  Text(context.l10n.welcome_greeting_button))
                ])
          ],
        ),
      ),
    );
  }
}
