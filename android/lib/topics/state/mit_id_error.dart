import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:betterlectio/logic/app/typography.dart';
import 'package:betterlectio/topics/welcome/widgets/illustration.dart';
import 'package:betterlectio/widgets/layout/padded_column.dart';

import '../../logic/student/student_bloc.dart';

class MitIdErrorScreen extends StatelessWidget {
  const MitIdErrorScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16.0),
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Illustration(illustration: "error"),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 16.0),
                child: PaddedColumn(
                  padding: 4.0,
                  children: [
                    Text(
                      "Login med MitID fejlede",
                      style: BlTypography.headlineSmall(context),
                      textAlign: TextAlign.center,
                    ),
                    Text(
                      "Ca. 1 gang om måneden kræver Lectio, at du logger ind med MitID på frisk. Andre gange fejler det bare.",
                      style: BlTypography.bodySmall(context),
                      textAlign: TextAlign.center,
                    )
                  ],
                ),
              ),
              FilledButton(
                  onPressed: () {
                    context.read<StudentBloc>().add(ResetError());
                  },
                  child: const Text("Tilbage"))
            ],
          ),
        ),
      ),
    );
  }
}
