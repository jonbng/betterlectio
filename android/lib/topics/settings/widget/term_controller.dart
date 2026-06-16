import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/types/terms/term.dart';
import 'package:betterlectio/logic/student/student_bloc.dart';
import 'package:betterlectio/topics/settings/bloc/term_bloc.dart';

class TermsController extends StatefulWidget {
  const TermsController({super.key});

  @override
  State<TermsController> createState() => _TermsControllerState();
}

class _TermsControllerState extends State<TermsController> {
  late TermBloc bloc;
  @override
  void initState() {
    super.initState();
    bloc = TermBloc(getStudentBloc(context).state.student!);
  }

  @override
  Widget build(BuildContext context) {
    return ListTile(
        title: BlocBuilder<TermBloc, List<Term>?>(
      bloc: bloc,
      builder: (context, state) {
        if (state == null) {
          return const SizedBox();
        }
        return InputDecorator(
          decoration: const InputDecoration(label: Text("Skoleår")),
          child: DropdownButton<Term>(
            underline: Container(),
            isDense: true,
            value: state.firstWhere((element) => element.active),
            items: state
                .map((term) =>
                    DropdownMenuItem<Term>(value: term, child: Text(term.name)))
                .toList(),
            onChanged: (value) {
              showDialog(
                context: context,
                builder: (context) {
                  return SimpleDialog(
                    contentPadding: const EdgeInsets.all(16.0),
                    title: const Text(
                        "For at skifte skoleår, skal du genstarte appen"),
                    children: [
                      FilledButton(
                        onPressed: () async {
                          if (value != null) {
                            await bloc.set(value);
                          }
                          exit(0);
                        },
                        child: const Text("Genstart"),
                      )
                    ],
                  );
                },
              );
            },
          ),
        );
      },
    ));
  }

  @override
  void dispose() {
    bloc.close();
    super.dispose();
  }
}
